# パフォーマンス調査レポート（2026-03-19）

## 1. 目的

トランザクション実行時（作成・更新・削除・確定）およびページ遷移時の待機時間・もっさり感の原因を特定し、優先順位付きの改善策を提示する。

## 2. 調査スコープと前提

- 対象: `app/`, `components/`, `lib/`, `proxy.ts`, `prisma/schema.prisma`
- 手法: 静的コード調査（実行時プロファイルは未実施）
- 補足: `next-devtools` の `nextjs_index` では稼働中 dev server を検出できず、ランタイム計測は行えていない

## 3. 結論サマリ

遅延の主要因は単一ではなく、以下の複合。

1. **遷移高速化機能（prefetch）を意図的に無効化**しており、毎回遷移時に待つ構造
2. **Proxy + 認証でリクエストごとDB照会**が発生し、遷移前段の遅延要因になっている
3. **画面が Client Component 中心 + `cache: "no-store"` 多用**で、遷移後に毎回API待ち
4. **通常のシフト操作APIが Google同期完了まで同期的に待機**している
5. **重いフォームが大きなクライアントバンドルで遅延読込されない**

特に体感悪化への寄与が大きいのは **(1) + (4)**。

## 4. 根拠（コード上の観測）

### 4.1 ページ遷移系

- サイドバー導線が `prefetch={false}`
  - `components/app-sidebar.tsx` L84, L104
- パンくず導線も `prefetch={false}`
  - `components/site-header.tsx` L187
- Proxy は `matcher` が広く、ページ系リクエスト全般で実行
  - `proxy.ts` L4
- `authorized` で `/my` 系アクセスごとに `prisma.user.findUnique`（`calendarId`確認）
  - `lib/auth.ts` L130-171, 特に L152-155
- `/my` layout でも毎回 `auth()` 実行
  - `app/my/layout.tsx` L17

### 4.2 データ取得系

- `cache: "no-store"` が画面・フォームで広範囲に使用（20箇所）
  - 例: `hooks/use-month-shifts.ts` L103-106
- `/my` 配下は Client page が多く（15ページ）、遷移後にクライアント側 fetch 待ちが発生しやすい

### 4.3 トランザクション系

- 単体シフト作成で DB保存後に `syncShiftAfterCreate` を待機
  - `app/api/shifts/route.ts` L100-102
- 更新・削除でも同様に同期処理を待機
  - `app/api/shifts/[id]/route.ts` L127-129, L180-184
- シフト確定でも同期処理を待機
  - `app/api/shifts/[id]/confirm/route.ts` L97
- 同期処理はリトライ待機（500/1500ms, 2000/6000ms）を含む
  - `lib/google-calendar/syncStatus.ts` L232-265
- 同期処理は Google API を複数回叩く設計（存在確認/所有確認/insert・patch・delete）
  - `lib/google-calendar/syncEvent.ts` L101-109, L230-239, L272, L331, L377

### 4.4 参考（良い実装が既にある箇所）

- 一括登録APIは `after()` で同期をバックグラウンド化済み
  - `app/api/shifts/bulk/route.ts` L191-213

## 5. 改善提案（優先順位付き）

## P0（即効性大、先に着手）

1. **遷移導線の prefetch を復帰**
   - `prefetch={false}` を外す（サイドバー・パンくず）
   - 必要なら一部だけ `prefetch={false}` に限定
   - 効果: 遷移体感を最短で改善

2. **単体シフト操作もバックグラウンド同期へ統一**
   - `POST /api/shifts`, `PUT /api/shifts/:id`, `DELETE /api/shifts/:id`, `PATCH /confirm` で同期完了待ちをやめる
   - 一括登録と同様に `after()` またはジョブ化
   - APIは `sync.pending = true` を返し、UIは非同期同期中の表示へ
   - 効果: トランザクション待ち時間を大幅短縮

3. **`loading.tsx` を重いセグメントに追加**
   - 例: `/my/shifts/new`, `/my/shifts/[id]/edit`, `/my/workplaces/**`
   - 効果: 実時間は同じでも体感待機を改善

## P1（中期、構造改善）

1. **認証情報の参照回数削減**
   - `requireCurrentUser` の `email -> user` 毎回DB照会を見直し
   - セッションに `userId` / `calendarId` を持たせる設計へ寄せる
   - `proxy` での DB照会回数も最小化

2. **Client fetch 依存を減らし Server Component 化を拡大**
   - 一覧系（カレンダー・勤務先・給与集計）をRSC主導に移し、必要箇所だけClient化
   - `no-store` 多用箇所を見直し、要件に応じて再検証戦略へ

3. **フォーム初期化のウォーターフォール縮小**
   - `ShiftForm` の初期データ取得（勤務先/シフト詳細/時間割）を統合API化または並列最適化

## P2（発展）

1. **同期処理をジョブキュー化（Outbox/Worker）**
   - DB保存トランザクション内で `sync_job` を enqueue
   - Worker が Google同期を非同期実行し、`shift.googleSyncStatus` 更新
   - UIは `sync-status` エンドポイントでポーリング or SSE

2. **重いフォームの遅延ロード**
   - `ShiftForm`（1390行）, `BulkShiftForm`（1748行）を `next/dynamic` で分割
   - 効果: 初回遷移のJS評価負荷を低減

## 6. バックグラウンド処理案（推奨）

### 6.1 最小変更案（既存資産活用）

- 現行 `syncStatus` をそのまま利用
- 単体操作APIでも `after(async () => runShiftSync(...))` へ移行
- レスポンスは即返却（`sync.pending=true`）
- クライアントは既存 `GET /api/shifts/[id]/sync-status` を使って状態表示

### 6.2 本命案（堅牢）

- `sync_jobs` テーブル追加（`id`, `shiftId`, `type`, `status`, `retryCount`, `scheduledAt`, `lastError`）
- APIは DB更新 + ジョブ作成のみ同期実行
- Worker が指数バックオフ付きで処理
- 失敗は可視化して手動再実行可能

## 7. 計測と検証（実施順）

1. **サーバー側計測**
   - `Server-Timing` ヘッダで `auth`, `db`, `google-sync` を分解
   - Route handlerごとの P50/P95 を記録

2. **遷移計測**
   - 主要導線の route transition time（クリック→描画完了）
   - prefetch有無で比較

3. **トランザクション計測**
   - 保存操作の API 応答時間（同期版 vs 非同期版）
   - `googleSyncStatus` の完了遅延（バックグラウンド完了まで）

## 8. 期待効果（目安）

- P0適用後
  - ページ遷移体感: 明確改善（先読み復帰の効果が大きい）
  - 保存/更新/削除の待機: Google API状態に依存しない応答へ短縮
- P1/P2適用後
  - 遷移と操作の揺らぎ（ネットワークやGoogle APIに引きずられる変動）を大幅低減

## 9. Next.js 公式ドキュメント根拠

- `after`（レスポンス後処理）
  - https://nextjs.org/docs/app/api-reference/functions/after
- Prefetching ガイド
  - https://nextjs.org/docs/app/guides/prefetching
- `<Link>` の prefetch 挙動
  - https://nextjs.org/docs/app/api-reference/components/link
- `loading.js`（即時ローディング状態）
  - https://nextjs.org/docs/app/api-reference/file-conventions/loading
- `proxy` の実行特性
  - https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Client Component の境界設計（`use client`）
  - https://nextjs.org/docs/app/api-reference/directives/use-client
