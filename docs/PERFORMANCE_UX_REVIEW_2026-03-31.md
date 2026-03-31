# パフォーマンス（UX）レビュー（2026-03-31）

## 1. 目的

現状コードベースを横断し、ユーザー体感（初期表示・画面遷移・操作応答）に効くパフォーマンス課題を特定し、優先度付きで改善方針を提示する。

## 2. 調査方法

- 静的コードレビュー: `app/`, `components/`, `hooks/`, `lib/`, `prisma/`
- Next.js ランタイム確認（MCP）:
  - `nextjs_index` で稼働サーバー確認
  - `get_routes`, `get_errors`, `get_page_metadata` でルート/エラー/描画構成を確認
- 既存ドキュメント差分確認:
  - `docs/PERFORMANCE_*` 一式

### 制約

- `pnpm build` は環境依存エラーで失敗（`lightningcss` のネイティブモジュール不足）
  - エラー: `Cannot find module '../lightningcss.linux-arm64-gnu.node'`
  - そのため本レポートは「実装コード起点」のレビューが中心

## 3. エグゼクティブサマリ

- 2026-03-20時点の最適化（`after()` での同期非同期化、loading整備）は反映済みで、以前の主要ボトルネックの一部は解消されている。
- 現在のUX劣化リスクは、**Client側主導のデータ取得設計**と**API/再描画の過剰往復**に寄っている。
- 直近で効果が高いのは以下。
  1. 一覧/編集ページの Server Component 化 + 初期データ注入
  2. `router.push()` 直後の `router.refresh()` の整理
  3. Google予定集約APIの負荷制御（対象カレンダー制限 + キャッシュ）

## 4. 主要所見（重要度順）

## P0: 早期対応推奨

### P0-1. 勤務先配下ページが Client wrapper 中心で、遷移後フェッチ待ちになりやすい

**影響**

- ページ遷移時に「まずシェル、後でデータ」の体験になり、一覧/編集で待ち時間が見えやすい。
- クエリパラメータ・URLパラメータ取得だけのために page 自体が Client 化され、不要なクライアントJSを増やしている。

**根拠**

- `app/my/workplaces/[workplaceId]/payroll-rules/page.tsx:1`
- `app/my/workplaces/[workplaceId]/timetables/page.tsx:1`
- `app/my/workplaces/new/page.tsx:1`
- `app/my/workplaces/[workplaceId]/edit/page.tsx:1`
- `app/my/workplaces/[workplaceId]/payroll-rules/new/page.tsx:1`
- `app/my/workplaces/[workplaceId]/timetables/new/page.tsx:1`

**改善方針**

- `page.tsx` は Server Component に戻し、`params/searchParams` を props で受けて子Clientへ渡す。
- 一覧系は可能な限り server-fetch で初期データを描画してから hydrate する。

### P0-2. フォーム送信後の `router.push` + `router.refresh` の重複で再取得が増える

**影響**

- 遷移先に必要なデータを再度取りにいくため、体感上の引っかかりが出やすい。
- モバイル回線/高遅延環境ほど影響が大きい。

**根拠**

- `components/workplaces/workplace-form.tsx:417`
- `components/workplaces/payroll-rule-form.tsx:506`
- `components/workplaces/timetable-form.tsx:407`
- `components/shifts/BulkShiftForm.tsx:1062`
- `components/shifts/BulkShiftForm.tsx:1073`

**改善方針**

- `push` 後の `refresh` は原則不要。必要画面のみ限定的に実行。
- ミューテーション後の即時反映は、遷移先で server data を取得する設計へ寄せる。

### P0-3. Google予定集約APIが月切替ごとに重い外部I/Oを実行

**影響**

- 一括登録画面で月移動時の体感遅延の主因になりうる。
- ユーザーのカレンダー数・イベント数に比例して遅くなる。

**根拠**

- フロント側月変更ごと取得: `components/shifts/BulkShiftForm.tsx:477` / `:574`
- 集約API（カレンダー一覧 + 各カレンダーイベント全件取得）
  - `app/api/calendar/events/route.ts:220`（calendar list）
  - `app/api/calendar/events/route.ts:256`（events list, `maxResults: 2500`）
  - `app/api/calendar/events/route.ts:451` 以降（全カレンダーfan-out）

**改善方針**

- 集約対象を絞る（例: 対象カレンダーIDをUIで選択/固定）。
- `month + userId` 単位の短TTLキャッシュを導入。
- まず件数だけ返し、詳細は当日クリック時にlazy取得する段階読み込みへ。

## P1: 中期で効く改善

### P1-1. 大型Clientコンポーネントに `zod` を同梱しており、JS負荷が高め

**影響**

- 初回ロード/遷移時のパース・評価コスト増。
- フォーム体験（入力開始まで）に遅延が乗りやすい。

**根拠**

- 大型コンポーネント規模
  - `components/shifts/ShiftForm.tsx`（1447行）
  - `components/shifts/BulkShiftForm.tsx`（2017行）
- 上記含むClient側 `zod` 利用
  - `components/shifts/ShiftForm.tsx:6`
  - `components/shifts/BulkShiftForm.tsx:7`
  - `components/workplaces/workplace-form.tsx:5`
  - `components/workplaces/payroll-rule-form.tsx:5`
  - `components/workplaces/timetable-form.tsx:6`

**改善方針**

- クライアント側レスポンス検証は軽量化（必要項目のみの型ガードへ）。
- 厳密検証はAPI層に寄せ、ClientはUX上必要な範囲に限定。

### P1-2. 一覧データ取得が no-store 前提で、訪問のたびに取得しやすい

**影響**

- 同じ画面を往復した際の体感速度が安定しにくい。
- API往復回数が増え、モバイルで顕著に遅くなる。

**根拠**

- `components/workplaces/workplace-list.tsx:116`
- `components/workplaces/payroll-rule-list.tsx:183`
- `components/workplaces/timetable-list.tsx:127`
- `hooks/use-month-shifts.ts:174`（毎月取得）
- API側ヘッダーで `no-store`
  - `next.config.ts:9`

**改善方針**

- 更新頻度の低い参照系は `stale-while-revalidate` 相当へ寄せる。
- 少なくともページ初期表示は server-fetch して、client re-fetch は差分更新時のみに。

### P1-3. シフト一覧ページが初期データなしで client-fetch 依存

**影響**

- `/my/shifts/list` 遷移時に必ずローディング文言を経由。
- ダッシュボード（初期データあり）より体感が劣化しやすい。

**根拠**

- ページは単純Client呼び出し: `app/my/shifts/list/page.tsx:1`
- データは `useMonthShifts` に完全依存: `components/shifts/shift-list-page-client.tsx:201`

**改善方針**

- ダッシュボードと同様、Server側で当月初期データを渡して hydrate する。

## P2: スケール時の先回り課題

### P2-1. シフト系検索条件に対してインデックスが最小限

**影響**

- データ件数増加時、未確定一覧・月次集計の応答が劣化しやすい。

**根拠**

- 既存index: `Shift @@index([workplaceId, date])` のみ
  - `prisma/schema.prisma:160`
- ただし実クエリは `isConfirmed` 条件を多用
  - `app/api/shifts/unconfirmed/route.ts:34`
  - `app/api/shifts/confirmed-current-month/route.ts:41`

**改善方針**

- 利用頻度に応じて `workplaceId + isConfirmed + date` の複合indexを検討。
- 集計用途で必要なら読み取り専用の派生テーブル/マテビューも将来的に選択肢。

## 5. 良い状態（維持推奨）

- Google同期は主要ミューテーションで `after()` 非同期化済み（以前課題の改善）
  - `app/api/shifts/route.ts:110`
  - `app/api/shifts/[id]/route.ts:128`
  - `app/api/shifts/[id]/confirm/route.ts:97`
- 重量級フォームは dynamic import で分割済み
  - `app/my/shifts/new/page.tsx:7`
  - `app/my/shifts/[id]/edit/page.tsx:7`
  - `components/shifts/BulkShiftFormLazy.tsx:6`
- `loading.tsx` が主要導線に配置され、待機中UXは改善済み

## 6. 推奨アクション（実行順）

1. `P0-1` 対応: 勤務先配下ページを Server page 化し、初期データ注入方式へ統一。
2. `P0-2` 対応: `router.push` 後の `router.refresh` を棚卸しし、必要箇所のみ残す。
3. `P0-3` 対応: `/api/calendar/events` を段階取得 + 短TTLキャッシュ化。
4. `P1-1` 対応: 大型Clientから `zod` を削減（API境界へバリデーション寄せ）。
5. `P2-1` 対応: シフト検索系インデックスを追加するかを実データ量で判定。

## 7. 追補（今回のランタイム確認）

- Next.js MCP `get_errors`: 取得時点で runtime/config error はなし。
- `get_page_metadata`: `/my` は `app/layout.tsx` + `app/my/layout.tsx` + `app/my/page.tsx` 構成で描画されていることを確認。
