# 初期表示・認証待ち改善の実装まとめ（2026-07-04）

## 1. 対象範囲

`231ee6d4476d99925246d69e0ba67ddbac2aecad` 以降で入った、初期表示・認証・計測まわりの変更をまとめる。

主な対象コミット:

- `0a32f3a` 初期表示の実測基盤を追加
- `f90d81d` proxy 認証の重複を削減
- `f4bacfe` / `0e8815c` `requireCurrentUser` の DB fallback を削減
- `6eb2750` auth 計測を詳細化
- `b4fd9d9` ダッシュボードと給与集計の取得を高速化
- `5972efe` / `cace2e6` / `aea9b45` `/my` の認証待機整理と blocking-route 回帰防止

## 2. 何を変えたか

### 2.1 計測を先に整えた

- `lib/perf/request-timing.ts` を追加し、`SHIFTA_PERF=1` 時だけ `Server-Timing` とサーバーログへ同じラベルを出すようにした。
- `scripts/performance/collect-server-timing.mjs` でローカルから複数回計測できるようにした。
- `/api/payroll/summary*`、`/api/workplaces*`、`/api/shifts/form-bootstrap`、`/my`、`/my/summary` を比較対象として固定した。

意図:

- 体感だけで最適化を判断しない。
- 改善後も同じラベルで退行確認できる状態を残す。

### 2.2 認証の正本を page/layout/API に寄せた

- `proxy.ts` を削除し、`/my` 配下の認証保護は Server Component と Route Handler 側を正本にした。
- `/login` は server-side で `auth()` を見て、認証済みなら `/my` へ redirect する。
- `requireCurrentUser()` と `requireSessionAndCurrentUser()` を current user 解決の共通入口に統一した。

意図:

- 同じリクエストで認証判定を二重化しない。
- 画面保護の責務を Next.js の実際の描画・API実行箇所へ寄せ、挙動を追いやすくする。

### 2.3 current user の fast path を作った

- NextAuth の session callback で `id`、`email`、`calendarId`、`googleTokenExpiresAt`、`createdAt`、`updatedAt` を session へ載せる。
- `requireCurrentUser()` は session.user から current user を復元できる場合、DB の `user.findUnique` を呼ばない。
- session に必要項目が欠ける場合だけ email lookup に fallback し、その lookup も request-scope cache で再利用する。

意図:

- 認証済みユーザーに対して毎回 DB で同じ user を引き直さない。
- fallback 契約は残し、既存 session や一時的不整合で壊れにくくする。

### 2.4 `/my` の shell を先に描画する構成へ寄せた

- `app/my/layout.tsx` はシェル描画専用にし、認証待機を持たせない。
- 認証 redirect と `calendarId` 未設定時の `/my/calendar-setup` 誘導は `app/my/(requires-calendar)/layout.tsx` と各 page に寄せた。
- サイドバーのユーザー情報は `/api/users/me` を client fetch にし、初回 shell 表示を user hydrate 待ちで止めない。

意図:

- レイアウト全体をブロックする I/O を減らす。
- 共通 shell と認証ガードを分離し、退行箇所を特定しやすくする。

### 2.5 ダッシュボードと給与サマリーの初回取得を削った

- `/my` は `getMonthShifts`、`getUnconfirmedShiftCount`、`getPayrollSummaryAmountForUser` を並列取得する。
- 翌月支給額は SSR 初期データとして `DashboardPageClient` に渡し、hydration 後の即時再取得を避ける。
- `getMonthShifts` と `getUnconfirmedShiftCount` は user 単位の Server Cache を持つ。
- `/my/summary` は初期表示で `getPayrollSummaryForUser` の 1 回だけを使い、月次集計と年内 context の初回二重取得をなくした。

意図:

- 「見えるまでに必要なデータ」と「後から更新してよいデータ」を分ける。
- SSR と client query の重複取得を減らして、初回描画の待ちを抑える。

### 2.6 blocking-route 警告を回避する実装上の制約を固定した

- pathname 依存 UI は Suspense 配下の client component に分離した。
- サイドバーの link は `prefetch={false}` を基本にし、hover/focus 時だけ明示 prefetch する。
- Route Handler で `connection()` を計測したいときは、`measure(() => connection())` ではなく、`await connection()` を `startStep/endStep` で囲む。

意図:

- `/my` 共通 layout や API で Next.js の blocking-route 警告を再発させない。
- prefetch による裏側の不要な認証・データ取得を抑える。

## 3. いまの運用ルール

次のルールを破ると、待ち時間退行や blocking-route 警告が再発しやすい。

1. `app/my/layout.tsx` に認証待機や pathname 依存処理を戻さない。
2. current user が session から取れる場面で追加の user lookup を書かない。
3. user 固有 API を共有キャッシュしない。`private, no-store` 契約を維持する。
4. 新しい初期表示改善は `SHIFTA_PERF=1` の同一ラベル比較を前提に進める。
5. `connection()` や request lifecycle primitive を計測ヘルパーのコールバック内へ入れない。

## 4. 関連ファイル

- `lib/api/current-user.ts`
- `lib/auth.ts`
- `lib/perf/request-timing.ts`
- `lib/perf/auth-timing.ts`
- `app/my/layout.tsx`
- `app/my/(requires-calendar)/layout.tsx`
- `app/my/(requires-calendar)/page.tsx`
- `app/my/(requires-calendar)/summary/page.tsx`
- `components/app-sidebar.tsx`
- `components/site-header.tsx`
- `performance/README.md`
