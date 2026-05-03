# パフォーマンス改善調査: セキュリティとUXを守るキャッシュ戦略（2026-05-02）

## 1. 目的

この文書は、Shifta の現状コードを前提に、セキュリティを落とさずに体感速度と操作応答性を改善するための候補を整理する。

特に以下を重視する。

- ユーザー固有のシフト・給与・Google Calendar 連携情報を共有キャッシュへ載せない
- データの正をアプリDBに置く既存方針を維持する
- Cache Components を含む Next.js 16 のキャッシュ層を段階的に検討する
- キャッシュ以外の UX / bundle / rendering / DB / 外部I/O 改善も列挙する

## 2. 調査方法

- 使用 skill
  - `vercel-react-best-practices`
  - `react-doctor`
  - `next-cache-components`
- Next.js MCP
  - `init`
  - `nextjs_index`
  - `nextjs_call get_project_metadata`
  - `nextjs_call get_errors`
  - `nextjs_call get_routes`
  - `nextjs_docs`
- ローカル調査
  - `pnpm install`
  - `npx -y react-doctor@latest . --verbose`
  - `pnpm next experimental-analyze --output`
  - `app/`, `components/`, `hooks/`, `lib/`, `next.config.ts`, `docs/PERFORMANCE_*` の静的確認

## 3. 現状サマリ

### 3.1 ランタイム状態

- Next.js dev server は `http://localhost:3000` で検出。
- `get_errors` は `configErrors: []`, `sessionErrors: []`。
- App Router ルートは `/my`, `/my/summary`, `/my/shifts/*`, `/my/workplaces/*`, `/api/*` を含む構成。

### 3.2 React Doctor

`react-doctor` の結果:

- Score: `77 / 100`
- warnings: `318`
- 対象: `94 / 232 files`

主な警告:

- Client Component の `useEffect` 内 `fetch()` が多い
- `recharts` が重い依存として検出されている
- `Intl.NumberFormat` が関数内で繰り返し生成されている
- `useSearchParams()` に Suspense 境界不足の指摘がある
- 大型 Client Component と複数 `useState` / 多数 `setState` が残っている
- `dangerouslySetInnerHTML` が `components/ui/chart.tsx` にある

### 3.3 既に改善済みの点

- `lib/api/current-user.ts` は `React.cache()` を使い、同一リクエスト内の `auth()` とユーザー取得を dedupe している。
- `lib/auth.ts` の `authorized` は、現在は DB 参照せずログイン有無と `/login` redirect に責務が絞られている。
- シフト作成・削除・確定系は `after()` による Google Calendar 同期の非同期化が進んでいる。
- `/my/summary` の chart は `next/dynamic` + `ssr: false` で分割済み。
- `lib/client-cache/*` にクライアントメモリキャッシュがあり、シフト変更時は `clearShiftDerivedCaches()` で同一タブ内の派生キャッシュを消している。
- DB index は `20260502023854_add_db_access_performance_indexes` で追加済み。

### 3.4 現時点の注意点

- `next.config.ts` は `cacheComponents: true` 未設定。したがって Cache Components の `use cache` / `cacheLife` / `cacheTag` 方針は未導入。
- `next.config.ts` で `/api/:path*` に `Cache-Control: private, max-age=30, stale-while-revalidate=300` を一括付与している。一部 API は route 内で `private, no-store, no-cache, must-revalidate` に上書きしているが、全 API に対して意図が明示されている状態ではない。
- `/api/calendar/events` は `userId + month + requestedCalendarIds` 単位で 60 秒の module-level Map cache を既に実装している。今後は新規導入ではなく、安全性・上限・stale 表示の改善が主な論点になる。
- 給与・シフト・Google Calendar 状態はユーザー固有かつ可変なので、共有 CDN cache / public cache の対象にしてはいけない。
- Next.js 公式ドキュメント上、`use cache: private` は experimental で production の主戦略にはしづらい。まずは runtime 値を外で読み、`userId` などの serializable argument として cached function に渡す設計を優先する。

## 4. セキュリティ前提

以下を性能改善の制約とする。

1. 認証・認可は毎回サーバー側で確認する。
2. `email`, OAuth token, refresh token, Google event raw payload はキャッシュキー・ログ・計測値へ出さない。
3. `calendarId` は Google Calendar API の呼び出しには必要だが、永続キャッシュ・ログ・計測値には raw 値を出さない。短命な in-memory key に必要な場合も、ログ出力しないことを前提にし、可能なら hash 化する。
4. 給与・シフト・勤務先はユーザー固有データとして扱い、共有キャッシュや CDN public cache に載せない。
5. キャッシュキーにユーザー境界を入れる場合は `userId` のような内部IDに限定する。
6. Route Handler / Server Action の戻り値は UI に必要な DTO だけに絞る。
7. ミューテーション後に stale な給与・シフトが表示されると UX と信頼性を落とすため、read-your-own-writes が必要な画面では即時 invalidation を優先する。

## 5. キャッシュ戦略: レイヤー別候補

### 5.1 リクエスト内 dedupe: `React.cache()`

現状:

- `lib/api/current-user.ts` で `getCachedSessionEmail()` と `getCachedCurrentUser()` を利用。

方針:

- この層は安全に継続する。
- 認証・ユーザー取得・同一リクエスト中に重複しやすい軽い参照に使う。
- 永続キャッシュではないため、ユーザー固有情報でも比較的扱いやすい。

候補:

- `requireCurrentUser()` 周辺の呼び出し回数を引き続き監視する。
- `requireOwnedWorkplace()` のような所有確認も、同一リクエスト内で重複するなら `React.cache()` に寄せる余地がある。

### 5.2 Next.js Cache Components: Server data / UI cache

前提:

- `next.config.ts` に `cacheComponents: true` を入れる必要がある。
- `use cache` は request-time API である `cookies()`, `headers()`, `searchParams` を直接読めない。
- Route Handler では `use cache` を handler 本体ではなく helper function に切り出す必要がある。

安全に試せる候補:

- 勤務先一覧: `getCachedWorkplaces(userId)`
- 勤務先詳細: `getCachedWorkplace(userId, workplaceId)`
- 給与ルール一覧: `getCachedPayrollRules(userId, workplaceId)`
- 時間割一覧: `getCachedTimetableSets(userId, workplaceId)`
- 月次シフト一覧: `getCachedMonthShifts(userId, startDate, endDate, includeEstimate)`
- 給与集計: `getCachedPayrollSummary(userId, paymentMonth)`
- 給与詳細: `getCachedPayrollDetailsMonthly(userId, paymentMonth)` / `getCachedPayrollDetailsYearly(userId, workplaceId, year)`

タグ設計案:

- `user:${userId}:workplaces`
- `user:${userId}:shifts`
- `user:${userId}:summary`
- `user:${userId}:payroll-details`
- `workplace:${workplaceId}:payroll-rules`
- `workplace:${workplaceId}:timetables`

ミューテーション別 invalidation:

- シフト作成・更新・削除・確定
  - `user:${userId}:shifts`
  - `user:${userId}:summary`
  - `user:${userId}:payroll-details`
- 勤務先作成・更新・削除
  - `user:${userId}:workplaces`
  - `user:${userId}:shifts`
  - `user:${userId}:summary`
  - `user:${userId}:payroll-details`
- 給与ルール変更
  - `workplace:${workplaceId}:payroll-rules`
  - `user:${userId}:shifts`
  - `user:${userId}:summary`
  - `user:${userId}:payroll-details`
- 時間割変更
  - `workplace:${workplaceId}:timetables`
  - LESSON シフト入力・編集の初期データ

注意:

- 現状は Route Handler 中の mutation が中心なので、`updateTag()` はそのまま使えない。`updateTag()` は Server Action 用で、Route Handler では `revalidateTag()` / `revalidatePath()` が基本になる。
- 現在の `revalidatePath()` は複数ページをまとめて invalidation しており広め。Cache Components 導入時は tag-based invalidation へ寄せると過剰 invalidation を減らせる。
- `use cache: private` は experimental なので、給与・シフトの本番主戦略にはしない。必要になった場合も、短い `stale` と明示的な UX 上の許容範囲を決めてから限定採用する。

### 5.3 HTTP / Route Handler cache

現状:

- `next.config.ts` で `/api/:path*` に一括 `private, max-age=30, stale-while-revalidate=300`。
- `app/api/payroll/summary/route.ts`, `app/api/payroll/details/monthly/route.ts`, `app/api/payroll/details/workplace-yearly/route.ts` は `no-store` を明示。
- `app/api/shifts/route.ts`, `app/api/workplaces/route.ts`, `app/api/calendar/events/route.ts` などは route 内で成功レスポンスの明示ヘッダーを付けていないため、全体ヘッダーの影響を受ける。

推奨:

- `/api` 全体への一括 cache header をやめ、route ごとに意図を明示する。
- 認証・OAuth・ユーザー・Google token 状態・mutation 系は `private, no-store`。
- シフト・勤務先・給与ルール・時間割などの GET は、クライアントメモリキャッシュまたは Cache Components と責務を分けて、HTTP cache は慎重に扱う。
- ブラウザの戻る/進むや短時間再訪だけを狙う場合は `private, max-age=15-30` 程度に限定する。
- 給与・シフト・Google Calendar event title を含むレスポンスは、ブラウザ永続キャッシュの価値より stale / 機微情報滞留リスクが勝つため、原則 `private, no-store` を優先する。短TTLを使う場合は server memory cache 側に閉じる。

候補分類:

| API                         | 方針                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/api/auth/*`               | `no-store`                                                                                                   |
| `/api/users/me`             | `no-store` または極短 `private`                                                                              |
| `/api/calendar/*`           | token / 外部状態を扱うため原則 `no-store`。`/api/calendar/events` は既存の 60秒 server memory cache を安全化 |
| `/api/shifts` GET           | ユーザー固有かつ mutation 頻度が高い。HTTP cache より server initial data / client memory を優先             |
| `/api/workplaces` GET       | 低頻度更新なので短TTL候補だが、まずは明示 `no-store` か client memory に責務を寄せる                         |
| `/api/payroll/*` GET        | 給与情報なので shared cache 不可。Cache Components 導入後も userId keyed + tag invalidation 必須             |
| POST / PUT / PATCH / DELETE | `no-store`                                                                                                   |

### 5.4 クライアントメモリキャッシュ

現状:

- `lib/client-cache/month-shifts-cache.ts`
- `lib/client-cache/summary-cache.ts`
- `lib/client-cache/payroll-details-cache.ts`
- `lib/client-cache/next-payment-cache.ts`
- `lib/client-cache/shift-derived-cache.ts`

良い点:

- 永続化しておらず、ページ再読み込みで消えるため機微情報の滞留が比較的短い。
- cache key に `currentUserId` を入れている箇所がある。
- シフト mutation 後に `clearShiftDerivedCaches()` を呼ぶ導線がある。

改善候補:

- すべての mutation 成功後に `clearShiftDerivedCaches()` または対象別 invalidation が漏れなく走るかテスト化する。
- 複数タブ利用時の stale 表示を避けるため、`BroadcastChannel` で cache clear を通知する。
- TTL を一律 5分ではなく、データ種別で分ける。
  - シフト一覧: 30秒から2分
  - 給与集計・詳細: 1分から5分。ただし mutation 後は即 clear
  - 勤務先・時間割・給与ルール: 5分から15分。ただし編集後は即 clear
- sessionStorage / localStorage への給与・シフト本体保存は避ける。現在の Map ベースを維持する。

### 5.5 Next.js Router cache / prefetch

公式 docs 上、Next.js は Link の自動 prefetch と client router cache により、ルート遷移を高速化する。

現状:

- `components/app-sidebar.tsx` は主要 navigation に `prefetch={false}` が残っている。
- `components/payroll-details/payroll-details-view-switch.tsx` も `prefetch={false}`。

方針:

- 主要導線は default prefetch に戻すか、hover intent prefetch へ切り替える。
- 大量リスト内の詳細リンクは `prefetch={false}` のままでよい。
- prefetch 時に副作用が走らないよう、page/layout render 中に mutation・ログ出力・外部書き込みをしない。

優先候補:

- サイドバーのメイン導線は default prefetch を復帰。
- 給与詳細 view switch は hover prefetch か default prefetch を検討。
- 動的で重いフォームページは `loading.tsx` を維持し、prefetch では static shell / fallback を温める。

### 5.6 CDN / static asset cache

方針:

- `/_next/static/*` は content hash + immutable なので標準のまま活用する。
- 認証配下ページの HTML / RSC payload は CDN public cache しない。
- PPR / Cache Components 導入後も、給与・シフトのユーザー固有コンテンツは CDN shared cache 対象にしない。
- 自前 CDN を置く場合は `_rsc` query と `rsc` header を正しく扱う必要がある。

追加候補:

- 静的 public asset は必要に応じて `assetPrefix` を検討。ただし現状の public asset は軽く、優先度は低い。
- CSP を強める場合、nonce-based CSP は PPR / static shell と相性が悪く、性能を落としやすい。まずは nonce なし CSP または SRI の検討に留める。

### 5.7 DB / query result cache

現状:

- 2026-05-02 の index migration で `Shift(workplaceId, date, startTime)`, `Shift(workplaceId, isConfirmed, date, startTime)`, `Workplace(userId, createdAt)` などが追加済み。
- `/my` の初期表示は月次シフトと未確定件数を並列取得している。
- `/api/shifts` は `includeEstimate=true` の場合、shift 取得後に payrollRule を取得して計算している。

候補:

- `getMonthShiftsWithEstimate` と `/api/shifts?includeEstimate=true` の重複ロジックを共通 DAL に寄せる。
- 月次給与集計は支給月・勤務先単位で計算結果を再利用できる形に整理する。
- データ件数が増えたら materialized view / summary table を検討する。ただし MVP では Cache Components + index + query 範囲縮小を先に試す。
- `includeEstimate=false` で先に一覧を表示し、給与見積もりは遅延取得する現在の方針は UX 上有効。対象ページを広げる余地がある。

### 5.8 Google Calendar 外部I/O cache

現状:

- データの正はアプリDBで、Google Calendar は表示・補助用途。
- `/api/calendar/events` は外部I/Oが重くなりやすい。
- 現行実装では `/api/calendar/events` に 60秒 TTL の module-level Map cache がある。
- cache key は `userId:month:requestedCalendarIds`。ユーザー境界はあるが、calendar id を raw で含める。
- Google API fetch はカレンダーごとに並列数 `3` で制御されている。

方針:

- アプリDB上のシフト・同期状態は正として即時反映。
- Google Calendar のイベント一覧は補助情報なので、server memory の短TTL cache は許容する。
- response header は route 内で `private, no-store` を明示し、ブラウザや中間層に event title を保存させない方針を優先する。
- token / refresh token / raw OAuth response は cache しない。
- cache key やログには email / token を含めない。calendar id を key に含める場合はログへ出さず、診断出力が必要なら hash 化する。

候補:

- 現行の `userId + month + requestedCalendarIds` 60秒 cache を維持しつつ、最大エントリ数と期限切れ削除を追加する。
- 一括登録画面では、選択済みカレンダーだけ取得する。
- 月全体のイベント詳細を最初から全取得せず、日付クリック時に詳細取得する段階読み込みを検討。
- 失敗時は cached stale data を「外部予定は最新でない可能性あり」と UI 表示する。ただしアプリDBのシフトは stale 扱いしない。

### 5.9 CI / build cache

実行時UXではないが、開発速度とリリース安定性に効く。

候補:

- CI で `.next/cache` と pnpm store を cache。
- `pnpm next experimental-analyze --output` の出力を PR 比較できるようにする。
- bundle budget を route 別に設定する。

## 6. キャッシュしないもの

以下は明示的にキャッシュ禁止または極短・限定扱いにする。

- OAuth access token / refresh token / id token
- NextAuth session の機微値
- `calendarId` を認可判定の正として複製した値
- Google Calendar の raw API response
- Server Action / Route Handler mutation response
- エラー詳細、stack trace、外部API失敗ログ
- email を含む cache key
- 認可前のデータ取得結果

## 7. キャッシュ以外の改善候補

### P0: 早期に効果が見込める

1. `/api` の一括 Cache-Control を route 別へ分解する
   - 現状の全 API `private, max-age=30, stale-while-revalidate=300` は意図が広すぎる。
   - security boundary を明確にし、給与・OAuth・mutation 系は `no-store` を明示する。
   - 見込める効果: セキュリティ・整合性リスクの低減が大きい。速度改善そのものより、以後の cache 導入を安全にする土台として効果が高い。
   - 主なリスク: GET API の短時間ブラウザキャッシュがなくなることで、戻る操作や連続表示がわずかに遅くなる可能性がある。ただし client memory / server initial data で補う。

2. `useSearchParams()` の Suspense 境界を修正する
   - react-doctor が `app/my/(requires-calendar)/shifts/new/page.tsx`, `app/my/(requires-calendar)/shifts/[id]/edit/page.tsx`, `components/dashboard/dashboard-page-client.tsx` を指摘。
   - CSR bail-out を避け、static shell / streaming の効果を保つ。
   - 見込める効果: 新規・編集フォームの初期描画で static shell を維持しやすくなる。白画面化や hydration 待ちの悪化を防ぐ。
   - 主なリスク: `returnTo`, `month`, `date` の query 引き渡しを壊すと戻り先 UX が悪化する。Server Page で `searchParams` を受け、Client form へ props として渡す実装が安全。
   - 補足: Dashboard は page 側に Suspense があるため、まず build / runtime 警告で実害を確認する。

3. `Intl.NumberFormat` を module scope に hoist する
   - 13箇所指摘あり。
   - 実装差分が小さく、リスクが低い。
   - 見込める効果: 個々の改善は小さいが、リスト・チャート・給与表示の再描画時に無駄な allocation を減らせる。
   - 主なリスク: locale / options が固定でない箇所を module scope に出すと表示仕様を壊す。固定条件の箇所だけ対象にする。

4. 主要 navigation の prefetch を見直す
   - サイドバー・給与詳細 view switch の `prefetch={false}` を棚卸し。
   - 大量リンクではなく主要導線なら default prefetch を使う。
   - 見込める効果: `/my`, `/my/summary`, `/my/shifts/*`, `/my/workplaces/*` の遷移体感が改善する。
   - 主なリスク: 認証配下の route を過剰に prefetch して DB / Google API を増やす可能性がある。Google API を叩く route は hover intent か prefetch 無効のままにする。

5. `dangerouslySetInnerHTML` の安全性を確認する
   - `components/ui/chart.tsx` の style injection は shadcn 系実装と思われるが、CSP 強化時の制約になる。
   - ユーザー入力が混ざらないことをテストまたはコメントで明確化する。

### P1: 中期で効く

1. Client fetch を Server Component 初期データ注入へ寄せる
   - react-doctor が `fetch()` inside `useEffect` を 16箇所指摘。
   - 一覧・詳細・編集フォームで、初期表示に必要なデータは server で取得し、Client は操作と差分更新に集中する。

2. 大型 Client Component を分割する
   - `ShiftForm`, `BulkShiftForm`, `dashboard-page-client`, `summary-page-client` など。
   - 入力セクション、確認セクション、カレンダーセクション、同期状態表示を分けて hydration と再描画単位を小さくする。

3. `recharts` の使用面積をさらに減らす
   - `/my/summary` は chart dynamic import 済み。
   - 未使用の `components/chart-area-interactive.tsx`, `components/data-table.tsx` が残っており、実際に不要なら削除候補。
   - 静的・単純な可視化は CSS / table で代替できるか検討する。

4. `setState` 多発を reducer / derived state へ整理する
   - 1つの effect で多数の state 更新を行う箇所は、描画回数と状態不整合リスクが増える。
   - フォーム系は `useReducer` または既存 validation hook の整理候補。

5. Google Calendar イベント取得を段階化する
   - 月移動時の全カレンダー fan-out を避ける。
   - UI で対象カレンダーを限定し、詳細は日付選択後に取得する。

### P2: 中長期

1. Cache Components を段階導入する
   - まずは read-only 参照系から。
   - mutation / invalidation / Suspense boundary の設計を先に決める。

2. Server Actions への移行可否を検討する
   - `updateTag()` を使う read-your-own-writes の整合性が取りやすくなる。
   - ただし既存 API route とテスト資産があるため、一括移行は避ける。

3. React Compiler の導入可否を検討する
   - react-doctor は未検出。
   - 導入前に router method destructuring や render 関数抽出など、Compiler に優しい形へ寄せる。

4. 継続計測
   - `Server-Timing` で `auth`, `db`, `payroll`, `googleCalendar` を分ける。
   - ログに email / token / calendarId を含めない。
   - Web Vitals / INP を追加計測する。

## 8. 推奨実施順

1. `/api` cache header 方針を route 別に明文化し、広域 cache header をなくす。
2. `useSearchParams()` のうち、確実に問題がある新規・編集シフトページを Server Page + Client child へ分離する。
3. `Intl` hoist など低リスク cleanup を実施する。
4. 主要 navigation の prefetch 方針を復帰または hover intent にする。ただし Google API を直接叩く導線は除外する。
5. Client fetch が目立つページから Server Component 初期データ注入へ寄せる。
6. 既存 `/api/calendar/events` cache を安全化する。
7. Cache Components の導入設計を作り、read-only 参照系から小さく有効化する。
8. tag-based invalidation に移行し、`revalidatePath()` の過剰 invalidation を減らす。

## 9. 具体的な実装計画

### T1: API cache header を route 別にする

目的:

- `/api/:path*` への一括 `Cache-Control` を廃止し、機微度と stale 許容度を route ごとに読める状態にする。

対象:

- `next.config.ts`
- `app/api/**/route.ts`
- 追加候補: `lib/api/cache-control.ts`

実装:

- `next.config.ts` の `/api/:path*` header を削除する。
- helper を追加する。
  - `NO_STORE_PRIVATE = "private, no-store, no-cache, must-revalidate"`
  - 必要な場合のみ `PRIVATE_SHORT_TTL = "private, max-age=30"`
- mutation response、OAuth / calendar setup / payroll / shift / workplace の GET は原則 `NO_STORE_PRIVATE` を明示する。
- `/api/calendar/events` は route response を `NO_STORE_PRIVATE` にし、既存 server memory cache に責務を寄せる。

見込める効果:

- セキュリティ・整合性: 高
- 体感速度: 低から中。直接速くするより stale / 漏えいリスクを下げる。

リスク:

- 短時間再表示でブラウザ cache が効かなくなる。
- header helper 導入時に response option の付け忘れが起きる。

検証:

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm format`
- 代表 API の response header 確認

### T2: `useSearchParams()` を安全な境界に移す

目的:

- `shifts/new` と `shifts/[id]/edit` の CSR bail-out リスクを下げる。

対象:

- `app/my/(requires-calendar)/shifts/new/page.tsx`
- `app/my/(requires-calendar)/shifts/[id]/edit/page.tsx`

実装:

- page を Server Component に戻し、`searchParams` / `params` を server 側で解決する。
- `ShiftForm` を dynamic import する小さな Client child を必要なら切り出す。
- `returnTo`, `date`, `month`, `shiftId` は props として渡す。

見込める効果:

- UX: 中。フォームページの初期描画と streaming の安定性が上がる。
- セキュリティ: 直接効果は低い。

リスク:

- query param の解釈差で戻り先や初期日付が変わる。

検証:

- `/my/shifts/new?date=YYYY-MM-DD&month=YYYY-MM&returnTo=list`
- `/my/shifts/[id]/edit?month=YYYY-MM&returnTo=list`
- Next.js MCP `get_errors`

### T3: 低リスク React Doctor cleanup

目的:

- 小さな allocation / hydration / a11y リスクを減らし、後続の大きな変更前にノイズを下げる。

対象:

- `Intl.DateTimeFormat` / `Intl.NumberFormat` 指摘箇所
- `ConfirmShiftCard` の label 関連
- `DeleteConfirmDialog` の `usePathname()` 指摘

実装:

- locale と option が固定の formatter だけ module scope に hoist する。
- 動的 locale が必要な箇所は `useMemo` に留める。
- semantic / label 警告は UX を変えずに修正する。

見込める効果:

- UX: 低から中。リストやフォームの再描画コストを少し下げる。
- 保守性: 中。react-doctor のノイズ削減に効く。

リスク:

- 表示 locale や日付形式を固定化しすぎるリスク。

検証:

- `npx -y react-doctor@latest . --verbose --diff`
- 対象画面の表示確認

### T4: prefetch 方針を主要導線だけ戻す

目的:

- ナビゲーションの体感速度を上げる。

対象:

- `components/app-sidebar.tsx`
- `components/payroll-details/payroll-details-view-switch.tsx`

実装:

- サイドバーの主要導線は `prefetch={false}` を外す。
- Google Calendar 外部I/Oが走る導線、または一覧内大量リンクは対象外にする。
- 給与詳細 view switch は build/analyze と実測で default prefetch か hover prefetch を選ぶ。

見込める効果:

- UX: 中。よく使う画面間の遷移待ちを減らせる。

リスク:

- prefetch による DB / API 負荷増。
- page render 中に副作用があると prefetch で意図せず動く。現時点では mutation は route handler 側なので大きなリスクは低いが、Google API 導線は慎重に扱う。

検証:

- production build 相当で遷移確認
- `pnpm next experimental-analyze --output`

### T5: Client fetch を Server Component 初期データへ寄せる

目的:

- 初期表示の waterfall と loading state を減らす。

優先対象:

1. `/my/shifts/list`
2. `/my/summary`
3. `/my/payroll-details/monthly`
4. `/my/payroll-details/workplace-yearly`
5. 勤務先・給与ルール・時間割の一覧ページ

実装:

- dashboard / shift list で重複している月次シフト取得ロジックを DAL へ切り出す。
- page 側で認証済み `userId` を使って初期データを取得し、Client Component には DTO として渡す。
- Client 側は月変更、削除、確定、再同期などの操作と差分更新に集中させる。

見込める効果:

- UX: 高。初回表示と route 遷移後の待ちが減る。
- サーバー効率: 中。重複ロジックをまとめることで query と payroll 計算の最適化がしやすくなる。

リスク:

- DTO 変換漏れや認可チェック漏れ。
- Client cache と server initial data の二重管理で stale 表示が起きる。

検証:

- 主要画面の初期表示、月移動、mutation 後の表示更新
- payroll 計算結果の既存テスト

### T6: `/api/calendar/events` 既存 cache を安全化する

目的:

- 既存の 60秒 server memory cache を、機微情報と stale UX の観点で明確に制御する。

対象:

- `app/api/calendar/events/route.ts`

実装:

- 成功レスポンスにも `NO_STORE_PRIVATE` を明示する。
- cache entry の最大数を設定し、期限切れ entry の掃除を追加する。
- calendar id を raw key に含める場合、ログへ出ないことを確認する。必要なら requested calendar ids 部分を hash 化する。
- cache hit / stale fallback を UI が識別できる DTO にするか検討する。

見込める効果:

- UX: 中から高。月移動や一括登録画面の再表示で Google API 待ちを減らせる。
- セキュリティ: 中。ブラウザ永続 cache と診断ログへの露出を抑える。

リスク:

- stale な外部予定により、ユーザーが最新の Google Calendar 状態と誤認する可能性。
- serverless 環境では module cache の持続性が保証されないため、効果は環境依存。

検証:

- cache hit / miss の動作
- token 期限切れ時に stale success と誤表示しないこと
- calendar id / token / email がログに出ないこと

### T7: Cache Components PoC

目的:

- 全面導入前に、Shifta のデータ境界で `use cache`, `cacheLife`, `cacheTag` が安全に使えるか確認する。

前提:

- T1 から T6 の後に実施する。
- `cacheComponents: true` はアプリ全体へ影響するため、単独タスクで扱う。

PoC対象:

- 勤務先一覧
- 勤務先詳細
- 給与ルール一覧
- 時間割一覧

実装:

- request-time API は cached function の外で読む。
- cached function は `userId`, `workplaceId` など serializable argument を受け取る。
- mutation 後は tag invalidation と既存 `revalidatePath()` の併用から始める。

見込める効果:

- UX: 中から高。read-only 参照系の再表示が安定して速くなる可能性がある。
- サーバー効率: 中。DB query の再利用余地が増える。

リスク:

- Cache Components 有効化による未対応 route の runtime error。
- stale 給与・シフト表示。給与・シフト本体は PoC 対象から外す。

検証:

- Next.js MCP `get_errors`
- 全 route smoke test
- mutation 後の invalidation

### T8: tag-based invalidation へ移行する

目的:

- 現在の広めの `revalidatePath()` を、データ単位の invalidation に寄せる。

対象:

- `app/api/shifts/**/route.ts`
- 勤務先・給与ルール・時間割 mutation route
- Cache Components PoC で作る cached helper

実装:

- tag 命名を `user:${userId}:...` と `workplace:${workplaceId}:...` に統一する。
- Route Handler では `revalidateTag()` を使う。
- Server Actions へ移す箇所が出た場合のみ `updateTag()` を検討する。

見込める効果:

- UX: 中。不要な再計算・再取得を減らせる。
- 保守性: 中。どの mutation が何を無効化するか読みやすくなる。

リスク:

- tag の付け忘れによる stale 表示。
- tag の広げすぎによる効果減少。

検証:

- シフト作成・編集・削除・確定後の `/my`, `/my/shifts/list`, `/my/summary`, payroll details
- 勤務先・給与ルール変更後の給与再計算

## 10. 実装時の検証観点

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm format`
- `npx -y react-doctor@latest . --verbose --diff`
- `pnpm next experimental-analyze --output`
- Next.js MCP `get_errors`
- Playwright またはブラウザで主要導線確認
  - `/my`
  - `/my/summary`
  - `/my/shifts/new`
  - `/my/shifts/list`
  - `/my/shifts/confirm`
  - `/my/workplaces`

確認すべき UX:

- 初期表示で真っ白待ちがない
- mutation 後に古い給与・シフトが残らない
- Google Calendar 同期失敗時もシフト保存は完了として扱われ、同期状態が見える
- 複数タブで stale cache が残りすぎない

## 11. 参照した公式ドキュメント

- Next.js Caching: https://nextjs.org/docs/app/getting-started/caching
- Next.js Revalidating: https://nextjs.org/docs/app/getting-started/revalidating
- `use cache`: https://nextjs.org/docs/app/api-reference/directives/use-cache
- `use cache: private`: https://nextjs.org/docs/app/api-reference/directives/use-cache-private
- Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Prefetching: https://nextjs.org/docs/app/guides/prefetching
- Streaming: https://nextjs.org/docs/app/guides/streaming
- Lazy Loading: https://nextjs.org/docs/app/guides/lazy-loading
- Package Bundling: https://nextjs.org/docs/app/guides/package-bundling
- CDN Caching: https://nextjs.org/docs/app/guides/cdn-caching
- Data Security: https://nextjs.org/docs/app/guides/data-security
- Content Security Policy: https://nextjs.org/docs/app/guides/content-security-policy

## 12. この計画では実施しないこと

- `cacheComponents: true` の有効化
- API route / Server Action の実装変更
- Prisma migration 作成
- package 追加
- push
