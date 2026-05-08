# TanStack Query 導入検証と実装計画（2026-05-07）

## 1. 結論

TanStack Query は導入価値がある。ただし、導入対象は「ブラウザ上の server state 管理」に限定し、Next.js 16 Cache Components / Server Components / Route Handler のキャッシュや再検証を置き換えない。

推奨方針:

- 段階導入する。最初は月次シフト、給与サマリー、給与詳細、勤務先系一覧の `useEffect + fetch + Map cache` を置換する。
- mutation 後の反映は `queryClient.invalidateQueries()` を主軸にし、Route Handler 側の `revalidateTag()` は維持する。
- Google Calendar 同期は部分成功・再認証・カレンダー初期設定遷移が絡むため、楽観更新は初期導入では使わない。
- `staleTime` はドメイン別に明示する。TanStack Query のデフォルトは stale 即時扱いのため、何も設定しない導入は過剰 refetch と UX ブレの原因になる。

導入効果の見込み:

| 観点       | 評価   | 理由                                                                                                                                 |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 安定性     | 高     | 手書きの abort / loading / error / cache invalidation を共通化でき、mutation 後の stale 表示リスクを下げられる。                     |
| UX         | 中〜高 | キャッシュ即時表示、background refetch、再試行、pending 状態、prefetch によって戻る操作・月移動・一覧遷移が滑らかになる。            |
| 性能       | 中     | API 自体は速くならない。重複 fetch 抑制と初期データ再利用に効果があるが、雑に導入すると request waterfall が増える。                 |
| 実装コスト | 中     | 既存の `lib/client-cache/*` と多数の `useEffect + fetch` を段階移行する必要がある。                                                  |
| リスク     | 中     | Next.js のサーバーキャッシュ、HTTP cache、TanStack Query cache が混在するため、責務境界を明確にしないと stale 原因が追いにくくなる。 |

## 2. 調査範囲

確認した主な資料:

- `docs/DESIGN_SPECIFICATION.md`
- `docs/API_REFERENCE.md`
- `docs/PERFORMANCE_SECURITY_UX_CACHE_STRATEGY_2026-05-02.md`
- `package.json`
- `next.config.ts`
- `app/my/(requires-calendar)/*`
- `components/dashboard/dashboard-page-client.tsx`
- `components/summary/summary-page-client.tsx`
- `components/shifts/*`
- `components/workplaces/*`
- `hooks/use-month-shifts.ts`
- `lib/client-cache/*`
- `lib/cache/*`
- `app/api/*`

参照した一次情報:

- Next.js 16.2.5 Docs: Fetching Data, Caching, Mutating Data, Route Handlers
- TanStack Query v5 Docs: Installation, Important Defaults, Query Keys, Query Invalidation, Optimistic Updates, Advanced Server Rendering, Performance & Request Waterfalls

ランタイム確認:

- Next.js MCP で `:3000` の起動中サーバーを確認。
- App Router / API routes は検出済み。
- 既存ランタイム警告として `components/ui/button.tsx` 起点の Base UI button semantics 警告がある。TanStack Query 導入とは別タスク。

## 3. 現コードベースの状態

### 3.1 依存関係

`package.json` には `@tanstack/react-table` はあるが、`@tanstack/react-query` は未導入。

導入時に必要なパッケージ:

- runtime: `@tanstack/react-query`
- 推奨 dev dependency: `@tanstack/eslint-plugin-query`

本リポジトリの運用ルール上、依存追加はユーザー実行が必要。

### 3.2 Next.js 側のキャッシュ

`next.config.ts` は `cacheComponents: true` を有効化している。

サーバー側では `lib/cache/workplace-read-cache.ts` に `use cache`, `cacheLife("minutes")`, `cacheTag()` を使った read cache がある。

mutation 後のサーバー再検証は `lib/cache/revalidate.ts` の `revalidateTag(tag, "max")` で行われている。

このため、TanStack Query は以下を置き換えない:

- Server Components の DB read
- `use cache` / `cacheTag` / `revalidateTag`
- Route Handler の認証・検証・DB mutation
- Google Calendar API のサーバー側短命メモリキャッシュ

### 3.3 クライアント側の独自キャッシュ

`lib/client-cache/*` に Map ベースの短命メモリキャッシュがある。

| ファイル                                    | 対象                     | TTL / 用途                           |
| ------------------------------------------- | ------------------------ | ------------------------------------ |
| `lib/client-cache/month-shifts-cache.ts`    | 月次シフト               | `useMonthShifts` から利用。          |
| `lib/client-cache/summary-cache.ts`         | 給与サマリー             | `SummaryPageClient` から利用。       |
| `lib/client-cache/payroll-details-cache.ts` | 給与詳細                 | 月次・勤務先年次の詳細ページで利用。 |
| `lib/client-cache/next-payment-cache.ts`    | 翌月支給額               | dashboard で利用。                   |
| `lib/client-cache/shift-derived-cache.ts`   | 派生キャッシュ一括クリア | シフト mutation 後にまとめて clear。 |

これらは TanStack Query の `queryKey`, `staleTime`, `gcTime`, `invalidateQueries` で置き換えやすい。

### 3.4 手書き fetch の集中箇所

主な対象:

| 領域                     | 現状                                                                                   | TanStack Query 適性                       |
| ------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| 月次シフト               | `hooks/use-month-shifts.ts` が初期データ、Map cache、abort、遅延見積取得を手書き管理。 | 高                                        |
| ダッシュボード翌月支給額 | `components/dashboard/dashboard-page-client.tsx` が Map cache と fetch を管理。        | 高                                        |
| 給与サマリー             | `components/summary/summary-page-client.tsx` が `initialSummary` と Map cache を管理。 | 高                                        |
| 給与詳細                 | `components/payroll-details/*` が Map cache を管理。                                   | 高                                        |
| 勤務先一覧               | Server Component から initial data を渡し、fallback fetch も持つ。                     | 中                                        |
| 給与ルール一覧           | workplace と rules を `Promise.all` fetch。                                            | 中                                        |
| 時間割一覧               | workplace 取得後、CRAM_SCHOOL の場合だけ timetables 取得。                             | 中                                        |
| シフト作成/編集フォーム  | 勤務先、シフト詳細、時間割、重複チェック、submit が混在。                              | 中                                        |
| 一括登録                 | 勤務先、Google Calendar events、時間割、submit が混在。                                | 中。ただし Calendar events は慎重に扱う。 |
| シフト確定               | 未確定・確定済みを `Promise.all` で再取得。                                            | 高                                        |

## 4. 導入による安定性向上

### 4.1 stale 表示の制御が明示的になる

現状は `clearShiftDerivedCaches()` に依存して、月次シフト・翌月支給額・給与サマリー・給与詳細を一括 clear している。これは単純で安全だが、以下の弱点がある。

- どの画面のどのデータが stale になったかを query key 単位で表現できない。
- 同一データを複数コンポーネントが読む場合の重複 fetch / 反映漏れを追いにくい。
- mutation 成功後の refetch 状態を UI と結びつけにくい。

TanStack Query では `["shifts", { month }]`, `["payroll", "summary", { month }]`, `["workplaces"]` のように key を分け、mutation 成功後に対象 key を invalidation できる。

### 4.2 abort / retry / error / pending の重複実装を減らせる

現状は多くの Client Component が以下を個別実装している。

- `AbortController`
- `isLoading`
- `errorMessage`
- response shape validation
- cache read / write
- mutation pending flag

TanStack Query は query cancellation, retry, background fetching, mutation pending state を提供するため、手書き状態管理を減らせる。

注意点:

- 給与・シフト・認証系の 4xx は自動 retry しない。
- Google Calendar の一時的な 5xx / rate limit は限定 retry 候補。
- デフォルト retry 3回は本アプリには強すぎる可能性があるため、global default は `retry: 1` 程度から始める。

### 4.3 query key による依存関係の漏れを検出しやすい

TanStack Query の query key は、query function が依存する変数を含める設計になっている。現状の文字列 cache key はファイルごとに独自定義されているため、key 設計が分散している。

導入後は `lib/query/query-keys.ts` のような key factory に集約する。

例:

```ts
export const queryKeys = {
  shifts: {
    month: (input: {
      userId: string;
      startDate: string;
      endDate: string;
      includeEstimate: boolean;
    }) => ["shifts", "month", input] as const,
    confirmation: () => ["shifts", "confirmation"] as const,
  },
  payroll: {
    summary: (input: { userId: string; month: string }) =>
      ["payroll", "summary", input] as const,
    detailsMonthly: (input: { userId: string; month: string }) =>
      ["payroll", "details", "monthly", input] as const,
  },
  workplaces: {
    list: (input: { userId: string; includeCounts: boolean }) =>
      ["workplaces", "list", input] as const,
    detail: (input: { workplaceId: string }) =>
      ["workplaces", "detail", input] as const,
  },
};
```

### 4.4 Server Components と Client Components の責務が整理できる

現在も Server Component で initial data を取得し、Client Component に渡している箇所がある。これは Next.js の方針と合っている。

TanStack Query 導入後も、初期表示に必要なデータは Server Component で取得し、Client 側では `initialData` または `HydrationBoundary` で受ける方針にする。

初期導入では `initialData` を優先し、後続で必要なページだけ `prefetchQuery + HydrationBoundary` に進めるのが安全。

## 5. 導入による UX 向上

### 5.1 戻る・月移動・画面再訪で即時表示しやすい

現状も Map cache で一部実現しているが、実装が機能ごとに分散している。TanStack Query なら以下を共通化できる。

- cache hit 時に即時表示
- stale data を表示しつつ background refetch
- `isFetching` で「更新中」表示
- inactive query の `gcTime` による自然破棄

特に効果が大きい画面:

- `/my`
- `/my/shifts/list`
- `/my/summary`
- `/my/payroll-details/monthly`
- `/my/payroll-details/workplace-yearly`
- `/my/shifts/confirm`

### 5.2 mutation 後の体感を改善できる

対象:

- シフト削除
- シフト確定
- Google Calendar 再同期
- 勤務先削除
- 給与ルール削除
- 時間割削除

導入初期は楽観更新ではなく、mutation pending 表示と invalidation を優先する。

シフト削除・確定だけは、Google Calendar 同期失敗時の部分成功表現が既にあるため、楽観更新を急ぐと UX が悪化する可能性がある。まずは「DB 成功後に該当 query を invalidate」する。

### 5.3 prefetch の設計余地が増える

TanStack Query の prefetch を使うと、以下の導線で体感改善が見込める。

- 月移動ボタン hover / click 直前に前後月のシフトを prefetch
- 給与サマリーの月変更確定前に query を準備
- 給与詳細の view switch 前に関連 query を prefetch
- 勤務先詳細配下の給与ルール・時間割一覧をリンク hover で prefetch

ただし、Google Calendar API を叩く導線は prefetch 対象から外す。外部 API 負荷と認証エラー表示のタイミングが制御しづらいため。

## 6. 導入時のリスク

### 6.1 デフォルト挙動による過剰 refetch

TanStack Query はデフォルトで cached data を stale と見なし、mount / window focus / reconnect などで background refetch する。

本アプリでは給与・シフトの体感安定性が重要なので、query ごとに `staleTime` を明示する。

推奨初期値:

| データ                 | staleTime | gcTime | 備考                                     |
| ---------------------- | --------- | ------ | ---------------------------------------- |
| 月次シフト             | 30秒〜2分 | 5分    | mutation 後は即 invalidate。             |
| 給与サマリー           | 1分〜5分  | 10分   | mutation 後は即 invalidate。             |
| 給与詳細               | 1分〜5分  | 10分   | mutation 後は即 invalidate。             |
| 勤務先一覧             | 5分       | 15分   | 勤務先 mutation 後は即 invalidate。      |
| 給与ルール / 時間割    | 5分       | 15分   | 編集頻度は低いが給与計算へ影響する。     |
| Google Calendar events | 0〜60秒   | 5分    | 初期導入では既存サーバーキャッシュ維持。 |

### 6.2 キャッシュ層が増える

導入後は以下のキャッシュが併存する。

- Next.js Cache Components
- Route Handler / HTTP cache control
- サーバー短命メモリキャッシュ
- TanStack Query browser cache

責務境界:

- サーバー: DB read の再利用、タグ再検証、認証境界、外部 API 短命 cache
- クライアント: 画面内・画面間の server state 再利用、background refetch、mutation pending / invalidation
- HTTP cache: 給与・シフト・OAuth 関連は原則 `private, no-store`

### 6.3 request waterfall を増やす可能性

TanStack Query は API を速くしない。Client Component の中で query を増やすだけだと waterfall が増える。

対策:

- 既に Server Component で取得している initial data は維持する。
- 複数 query は `useQueries` / `useSuspenseQueries` または API 統合を検討する。
- シフト確定のように未確定・確定済みを同時に読む箇所は並列性を維持する。
- フォームの workplace -> timetable のような本当に依存する query だけ `enabled` を使う。

### 6.4 楽観更新と Google Calendar 部分成功の相性

本アプリのデータの正はアプリDBで、Google Calendar は表示・補助用途。ただし UI では同期失敗・再認証・初期設定誘導を丁寧に表示している。

楽観更新を先に入れると、以下が起きやすい。

- DB は成功、Google 同期は失敗した状態の表示が追いつかない。
- retry-sync の pending / failed 表示が古い cache に残る。
- Calendar setup への redirect と optimistic rollback が競合する。

初期導入では optimistic update は見送る。

## 7. 実装計画

実装はしない。以下は将来の実装計画。

### TQ-0: 依存追加と前提確認

目的:

- TanStack Query v5 を導入できる状態にする。

作業:

- ユーザーが `pnpm add @tanstack/react-query` を実行する。
- 任意でユーザーが `pnpm add -D @tanstack/eslint-plugin-query` を実行する。
- エージェント側は依存追加後に `pnpm install` で同期する。

完了条件:

- `package.json` と `pnpm-lock.yaml` に依存が追加されている。
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm format` が通る。

### TQ-1: QueryClient Provider と共通設定を追加

目的:

- アプリ全体で TanStack Query を利用可能にする。

作業:

- `app/providers.tsx` または `components/providers/query-provider.tsx` を追加する。
- `QueryClientProvider` を `app/layout.tsx` の `ThemeProvider` 内側に配置する。
- QueryClient は browser singleton として作る。
- default options を明示する。

推奨初期設定:

- `queries.staleTime`: 60秒
- `queries.gcTime`: 5分
- `queries.retry`: 1
- `queries.refetchOnWindowFocus`: false から開始
- `mutations.retry`: 0

注意:

- 後で query ごとに `staleTime` を上書きする。
- Devtools は必要なら開発環境限定で別タスクにする。

### TQ-2: query key と fetcher を共通化

目的:

- query key の分散と response parsing の重複を減らす。

作業:

- `lib/query/query-keys.ts`
- `lib/query/fetch-json.ts`
- `lib/query/options/*` または `lib/query/queries/*`

設計:

- key には user 境界と query 変数を含める。
- `Date` オブジェクトは key に入れず、`YYYY-MM` / `YYYY-MM-DD` 文字列へ正規化する。
- API error は `resolveUserFacingErrorFromResponse` と整合させる。
- parse 関数は既存の型安全な parser を移すか再利用する。

完了条件:

- query key の unit test を作る。
- fetcher の 2xx / 4xx / invalid json / abort の test を作る。

### TQ-3: 月次シフトを移行

目的:

- 最も効果が大きい `useMonthShifts` と `month-shifts-cache` を置換する。

対象:

- `hooks/use-month-shifts.ts`
- `lib/client-cache/month-shifts-cache.ts`
- `components/dashboard/dashboard-page-client.tsx`
- `components/shifts/shift-list-page-client.tsx`

作業:

- `useMonthShiftsQuery` を作る。
- Server Component の `initialMonthShifts` は `initialData` として利用する。
- `deferEstimate` は query を2段階に分ける。
- `includeEstimate=false` で先に表示し、`includeEstimate=true` は background query または dependent query にする。
- `reload()` は `invalidateQueries` / `refetch` に置換する。

完了条件:

- `/my` と `/my/shifts/list` の初期表示が変わらない。
- 月移動、削除後再取得、再同期後再取得が通る。
- 既存の shift list tests を更新する。

### TQ-4: 給与サマリー・給与詳細・翌月支給額を移行

目的:

- `lib/client-cache/summary-cache.ts`, `payroll-details-cache.ts`, `next-payment-cache.ts` を置換する。

対象:

- `components/summary/summary-page-client.tsx`
- `components/dashboard/dashboard-page-client.tsx`
- `components/payroll-details/payroll-details-monthly-page-client.tsx`
- `components/payroll-details/payroll-details-workplace-yearly-page-client.tsx`

作業:

- `usePayrollSummaryQuery`
- `usePayrollDetailsMonthlyQuery`
- `usePayrollDetailsWorkplaceYearlyQuery`
- dashboard の next payment は summary query の `select` で `totalWage` を読む。

完了条件:

- 月変更時に cached data が即時表示され、background 更新中の表示ができる。
- シフト mutation 後に summary / details が stale のまま残らない。

### TQ-5: mutation invalidation を統一

目的:

- `clearShiftDerivedCaches()` を TanStack Query invalidation へ移行する。

対象 mutation:

- シフト作成 / 編集 / 削除
- シフト一括登録
- シフト確定
- Google Calendar 再同期
- 勤務先削除
- 給与ルール削除
- 時間割削除

作業:

- `useCreateShiftMutation`
- `useUpdateShiftMutation`
- `useDeleteShiftMutation`
- `useConfirmShiftMutation`
- `useRetryShiftSyncMutation`
- `useDeleteWorkplaceMutation`
- `useDeletePayrollRuleMutation`
- `useDeleteTimetableSetMutation`

invalidation 方針:

- shift mutation: `shifts`, `payroll.summary`, `payroll.details`, `workplaces`
- workplace mutation: `workplaces`, `shifts`, `payroll.summary`, `payroll.details`
- payroll rule mutation: `workplaces.detail`, `payroll.summary`, `payroll.details`, `shifts`
- timetable mutation: `workplaces.timetables`, shift form 用 timetable query

完了条件:

- mutation 成功後に関連画面へ戻っても stale 表示しない。
- Google Calendar 同期失敗時の既存 toast / redirect 挙動を維持する。

### TQ-6: 勤務先・給与ルール・時間割一覧を移行

目的:

- 設定管理系の fetch / loading / delete state を整理する。

対象:

- `components/workplaces/workplace-list.tsx`
- `components/workplaces/payroll-rule-list.tsx`
- `components/workplaces/timetable-list.tsx`

作業:

- Server Component の initial data を `initialData` として受ける。
- delete mutation 成功後は local state filter ではなく query invalidation または `setQueryData` を使う。
- 給与ルール一覧の workplace / rules は並列 query を維持する。
- 時間割一覧は workplace type に応じて timetable query を `enabled` 制御する。

完了条件:

- 一覧削除後の表示、toast、警告メッセージが現行通り。

### TQ-7: シフト確定ページを移行

目的:

- `loadShiftConfirmationData` の手書き再取得を query 化する。

対象:

- `app/my/(requires-calendar)/shifts/confirm/page.tsx`
- `components/shifts/shift-confirm-page-client.tsx`
- `components/shifts/ConfirmShiftCard.tsx`

作業:

- 未確定シフト query と確定済み今月 query を定義する。
- 初期データは Server Component から `initialData`。
- 確定 mutation 成功後に confirmation queries を invalidate。

完了条件:

- 確定後、カード削除と確定済み一覧反映が現行通り。

### TQ-8: フォーム系の読み取り query を移行

目的:

- シフトフォーム・一括登録の dependent fetch を整理する。

対象:

- `components/shifts/ShiftForm.tsx`
- `components/shifts/BulkShiftForm.tsx`
- `components/workplaces/workplace-form.tsx`
- `components/workplaces/payroll-rule-form.tsx`
- `components/workplaces/timetable-form.tsx`

作業:

- 勤務先一覧 query
- シフト詳細 query
- 時間割 query
- Google Calendar events query は最後に検討

注意:

- フォーム入力状態は TanStack Query に入れない。
- `localStorage` の last workplace / bulk calendar selection は現行通り local UI state として維持する。
- 重複チェックは submit 直前の one-shot request として残してもよい。

完了条件:

- 新規 / 編集 / 一括登録の入力初期化が現行通り。
- CRAM_SCHOOL 選択時の時間割自動選択が壊れない。

### TQ-9: SSR hydration / prefetch を必要箇所だけ導入

目的:

- Client Component での初回 pending を避け、Next.js App Router と Query cache を整合させる。

候補:

- `/my`
- `/my/shifts/list`
- `/my/summary`
- `/my/payroll-details/*`

作業:

- `prefetchQuery + dehydrate + HydrationBoundary` を検証する。
- まずは initialData で十分かを測定し、必要箇所だけ HydrationBoundary に移行する。

完了条件:

- 初回描画の loading 退行がない。
- client hydration 後に同じ query が即 refetch しない。

### TQ-10: 既存独自 client-cache を削除

目的:

- 二重キャッシュをなくす。

削除候補:

- `lib/client-cache/month-shifts-cache.ts`
- `lib/client-cache/summary-cache.ts`
- `lib/client-cache/payroll-details-cache.ts`
- `lib/client-cache/next-payment-cache.ts`
- `lib/client-cache/shift-derived-cache.ts`

条件:

- 参照が完全になくなっている。
- TanStack Query invalidation に置換済み。
- regression test が通っている。

## 8. 検証計画

各タスクで実行する:

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm format`

追加で確認する手動シナリオ:

- `/my` 初期表示、月移動、シフト削除、Google Calendar 再同期
- `/my/shifts/list` 月移動、削除後の一覧反映
- `/my/summary` 月変更、シフト追加後の再表示
- `/my/payroll-details/monthly` 月変更
- `/my/payroll-details/workplace-yearly` 勤務先・年変更
- `/my/workplaces` 勤務先削除後の一覧反映
- `/my/workplaces/:id/payroll-rules` 給与ルール削除後の一覧反映
- `/my/workplaces/:id/timetables` 時間割削除後の一覧反映
- `/my/shifts/confirm` 確定後の未確定/確定済み反映
- Google token expired / calendar setup required の toast と redirect

計測:

- React Query Devtools または Network tab で重複 fetch と waterfall を確認する。
- mutation 後に stale data が残らないことを確認する。
- window focus / reconnect で過剰 refetch が起きないことを確認する。

## 9. 採用判断

採用する。ただし、以下を満たす場合に限る。

- query key factory を先に作る。
- `staleTime` / `gcTime` / invalidation 方針をドメイン別に明示する。
- initialData を活かして初期表示の UX を落とさない。
- optimistic update は初期導入の範囲外にする。
- Next.js Cache Components と Route Handler の `revalidateTag` は維持する。
- Google Calendar events は初期移行対象から外すか、最終段階で限定的に扱う。

不採用または延期すべきケース:

- 依存追加を避けたい。
- 近い将来に Server Actions 中心へ全面移行する計画がある。
- 現在の Map cache で十分で、mutation 後 stale 表示や loading/error 重複の保守負荷を問題視しない。

現状のコード量と `useEffect + fetch` の分散を見る限り、段階導入による保守性・安定性・UX の改善余地は十分ある。
