# Performance Analysis (2026-04-30)

## 1. 対象データ

- Lighthouse JSON:
  - `lighthouse_my.json`
  - `lighthouse_my_summary.json`
  - `lighthouse_my_shifts_new.json`
  - `lighthouse_my_workplaces.json`
- Network 集計:
  - `network.json`

## 2. 要約（結論）

- 体感遅延の主因は、JS 実行ではなくサーバー応答待ち（Document/API）側の可能性が高い。
- 特に `/my/shifts/new` では `GET /api/workplaces` が単発で約 `1.76s`（Network）〜`2.00s`（Lighthouse 内 request）と突出。
- `/my`, `/my/summary`, `/my/workplaces` も Document リクエストの完了が `2.45s〜3.60s`（Lighthouse network-requests 上）で、初期表示を押し下げている。
- Lighthouse の `unused-javascript` はブラウザ拡張のスクリプト混入が大きく、アプリ本体の最適化余地を過大評価している可能性がある。

## 3. 計測結果の読み取り

### 3.1 Network.json（手計測）

- `/my/`
  - waiting-for-server-response: `1.85s`
  - content-download: `1.76s`
  - JS transferred: `319kB`
- `/my/summary`
  - waiting-for-server-response: `1.08s`
  - content-download: `998.28ms`
  - JS transferred: `426kB`
- `/my/shifts/new`
  - waiting-for-server-response: `1.86s`
  - content-download: `67.42ms`
  - JS transferred: `344kB`
  - slowest API: `workspaces` `1.76s`（実質 `/api/workplaces` と推定）
- `/my/workspaces`（URL は workplaces）
  - waiting-for-server-response: `1.09s`
  - content-download: `232.76ms`
  - JS transferred: `318kB`

### 3.2 Lighthouse（Performance）

- スコアは 95〜99 と高いが、実測の待ち時間課題と乖離があるため、スコア単体では判断しない。
- `network-requests` からの Document 完了時間:
  - `/my`: `3.60s`
  - `/my/summary`: `2.54s`
  - `/my/workplaces`: `2.45s`
  - `/my/shifts/new`: `0.99s`
- `unused-javascript` 上位には以下が含まれる:
  - `chrome-extension://.../content_script.js`
  - `chrome-extension://.../installHook.js`
- つまり、未使用 JS の一部はアプリ由来でなく計測ノイズ。

## 4. slowest API の特定結果

- 今回データで明確に遅いのは `/my/shifts/new` 読み込み時の `GET /api/workplaces`。
- Lighthouse 内でも同 API が約 `2.00s` で最遅。
- 他ページでは API の単発突出より、Document/RSC 応答待ちが支配的。

## 5. コードベース照合（原因候補）

### 5.1 `/my/shifts/new` の初回 API 待ち

- [`components/shifts/ShiftForm.tsx:489`](/workspace/components/shifts/ShiftForm.tsx:489)
  - 初回マウントで `fetch("/api/workplaces", { cache: "no-store" })` を必ず実行。
- [`app/api/workplaces/route.ts:244`](/workspace/app/api/workplaces/route.ts:244)
  - `workplace.findMany + _count(shifts, payrollRules, timetableSets)` を毎回取得。
- 仮説:
  - `no-store` によりキャッシュ効かず、DB + 集計カウントが都度ボトルネック化。

### 5.2 `/my` 系 Document 応答の重さ

- [`app/my/(requires-calendar)/page.tsx:192`](</workspace/app/my/(requires-calendar)/page.tsx:192>)
  - 初期描画前に `Promise.all` で以下を同時実行:
  - シフト一覧 + 推定給与計算
  - 未確定件数
  - 次月支給額計算
- [`lib/payroll/summary.ts:153`](/workspace/lib/payroll/summary.ts:153)
  - 給与集計処理は複数クエリ + ループ計算を行う構造。
- 仮説:
  - データ量増加時に CPU/DB 両面でページ応答に直結。

### 5.3 認証/ユーザー取得の繰り返し

- [`lib/api/current-user.ts:24`](/workspace/lib/api/current-user.ts:24)
  - `auth()` と `user.findUnique` を伴う `requireCurrentUser` が多ページ/API で呼ばれる。
- 単一リクエスト内は `react cache` である程度抑制されるが、ページ遷移や API 呼び出し単位では再実行。

## 6. 優先度付き改善候補（改訂版）

### P0（即効性が最も高い）

- 認証後シェルの自動 prefetch を抑制する
  - 根拠: `/my` 計測時に `/my/summary`, `/my/shifts/list`, `/my/shifts/confirm`, `/my/workplaces` への `_rsc` fetch が同時に発生。
  - コード箇所: [`components/app-sidebar.tsx:95`](/workspace/components/app-sidebar.tsx:95), [`components/app-sidebar.tsx:116`](/workspace/components/app-sidebar.tsx:116)
  - 対応案:
  - サイドバーリンクは `prefetch={false}` を基本にする。
  - 必要なら hover 時のみ `router.prefetch()` する方式に切替。
  - 期待効果:
  - 初回表示時のバックグラウンド通信を削減し、Document/RSC 応答競合を軽減。
  - DB/API への無駄な先読み負荷も減る。
  - セキュリティ面:
  - データ公開範囲は変えず、不要な認証付きリクエストを減らす方向なので安全側。

### P1（高効果）

- `/my` のサーバー初期レンダリングで重い集計をブロックしない
  - 根拠: [`app/my/(requires-calendar)/page.tsx:192`](</workspace/app/my/(requires-calendar)/page.tsx:192>) の `Promise.all` に次月支給額計算が含まれ、初期レスポンスを待たせる。
  - 対応案:
  - `getPayrollTotalWageForUserByMonth` は初回は非同期後追い取得に変更（クライアント側プレースホルダ表示）。
  - すでにクライアント再取得ロジックがあるため、初回にも適用しやすい。
  - 期待効果:
  - `/my` の TTFB / doc duration 改善。
  - セキュリティ面:
  - 認可ロジックは維持。取得タイミングを変えるだけで権限境界は不変。

- `workplaces` 取得経路を用途別に分離（重い `_count` を必要箇所に限定）
  - 根拠: [`app/api/workplaces/route.ts:244`](/workspace/app/api/workplaces/route.ts:244) は常に `_count` を含む。
  - 対応案:
  - フォーム用軽量 endpoint（`id,name,color,type`）を追加。
  - あるいは `/api/workplaces` に query で include を切替（`includeCounts=false`）。
  - 期待効果:
  - `/my/shifts/new` および `/my/shifts/bulk` の初回待ちを短縮。
  - セキュリティ面:
  - 返却項目を減らすだけなので、露出はむしろ減る。

### P2（中〜高効果）

- DB クエリ条件を index 友好にする（関係フィルタ -> `workplaceId IN (...)`）
  - 根拠:
  - [`app/my/(requires-calendar)/page.tsx:64`](</workspace/app/my/(requires-calendar)/page.tsx:64>) の `shift.findMany` は `workplace: { userId }` フィルタ。
  - [`lib/payroll/summary.ts:200`](/workspace/lib/payroll/summary.ts:200) も同様。
  - スキーマは `Shift @@index([workplaceId, date])` を持つ。
  - 対応案:
  - 先に当該ユーザーの `workplaceIds` を取得し、`where: { workplaceId: { in: ... }, date: ... }` へ変更。
  - 期待効果:
  - 大量データ時のスキャン範囲を縮小しやすい。
  - セキュリティ面:
  - `workplaceIds` は認証ユーザー起点で作るため、権限制約を維持可能。

### P3（再発防止・継続改善）

- サーバー計測を標準化する（`Server-Timing` または Prisma query log）
  - 目的: 「どの API/クエリが遅いか」を毎回同じ形式で比較可能にする。
  - セキュリティ面:
  - 本番では詳細ログに個人情報を出さない。計測値のみ記録。
- 計測ノイズ除去
  - 拡張機能を無効化したプロファイルで再計測し、`unused-javascript` の誤差を除去。

## 6.1 セキュリティ制約（実装時のルール）

- 認証必須 API の `public` キャッシュは禁止（CDN共有キャッシュ不可）。
- ユーザー固有データをキャッシュする場合:
  - 必ず userId をキーに含める。
  - 変更系 API 後に該当キャッシュを無効化する。
  - TTL は短く設定（まず 30s〜5m）。
- `no-store` を外す判断は endpoint 単位で行い、レスポンスの機密度に応じて `private` を維持する。

## 7. 計測データの信頼性メモ

- Lighthouse の `server-response-time`（10〜15ms）と、Network 実測（1.08〜1.86s）に乖離がある。
- このため、現時点の優先判断は以下を重視する:
  - Network タイムライン
  - Lighthouse `network-requests` の実リクエスト時間
  - コード上の同期/取得構造

## 8. 次回計測で必ず取るべき値

- ページごと（3回計測の中央値）:
  - Document TTFB
  - Document total duration
  - JS transferred
  - slowest API URL と duration
- API ごと:
  - `/api/workplaces` の response size
  - DB 実行時間（可能なら Prisma query log / Server-Timing で分解）

## 9. 実施順（推奨）

1. `P0`: サイドバーの prefetch 抑制（最小変更で効果確認しやすい）
2. `P1`: `/my` 初期表示のブロッカー削減
3. `P1`: `workplaces` 軽量化
4. `P2`: DB クエリ形状の見直し
5. 再計測して、改善率が低い箇所のみ追加施策
