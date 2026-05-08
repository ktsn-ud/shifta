# シフト一括登録: 全Googleカレンダー予定表示 実装計画（2026-03-30）

## 1. 目的

`SCR_014`（シフト一括登録）の日付選択カレンダーに、Google Calendar の予定を「全カレンダー対象」で表示する。

- 目的: 登録前に既存予定との重なりを視認し、入力ミスを減らす
- 前提: データの正はアプリDB（Google予定は表示専用）
- 非目的: Google Calendar 側編集の逆同期、Google予定のDB保存

## 2. 現状整理

### 2.1 現在の実装

- 一括登録UI: `components/shifts/BulkShiftForm.tsx`
- 一括登録API: `app/api/shifts/bulk/route.ts`
- Google初期化API: `app/api/calendar/initialize/route.ts`
- Google APIクライアント: `lib/google-calendar/client.ts`
- Google認証・スコープ判定: `lib/google-calendar/auth.ts`
- OAuthスコープ定義: `lib/google-calendar/constants.ts`

### 2.2 既存制約

- 現在のスコープは `https://www.googleapis.com/auth/calendar.app.created` のみ
- このスコープでは「ユーザーの全カレンダー予定」を読めない
- `DESIGN_SPECIFICATION.md` の方針どおり、Google側編集はアプリへ逆同期しない

## 3. 仕様方針（今回の追加分）

### 3.1 画面仕様（SCR_014追加）

- 日付セルに「Google予定あり」マーカーを表示
- 日付クリック時（またはホバー時）に当日予定の要約を表示
- 対象は「ユーザーがアクセス可能な全Googleカレンダー」
- 取得範囲は「表示中の月」のみ（前月/次月移動時に再取得）
- 予定は表示専用で、保存・編集・削除は行わない

### 3.2 データ仕様

- APIレスポンスは日付単位に集約
- 最低限含める項目
  - `date` (`YYYY-MM-DD`)
  - `count`（当日予定件数）
  - `items[]`（title, start, end, allDay, calendarId, calendarSummary）
- 終日予定と時刻予定を区別
- 複数日終日イベントは日ごとに展開して集約

## 4. 実装タスク（コード変更）

## T1. Google OAuthスコープの拡張

### 変更対象

- `lib/google-calendar/constants.ts`
- `lib/auth.ts`
- `lib/google-calendar/auth.ts`

### 実装内容

- `calendar.events.readonly` を追加（全カレンダーのイベント閲覧用）
- `calendar.calendarlist.readonly` を追加（全カレンダーID列挙用）
- 既存のスコープ判定を単一値チェックから複数スコープ対応へ変更
- 認証エラーの扱いを以下に分離
  - 同期用スコープ不足（既存機能）
  - 閲覧用スコープ不足（新機能）

### 注意

- 既存ユーザーのトークンには新スコープが含まれないため、再同意が必要

## T2. 全カレンダー予定取得APIの追加

### 変更対象

- 追加: `app/api/calendar/events/route.ts`
- 参照: `lib/google-calendar/client.ts`, `lib/google-calendar/auth.ts`

### 実装内容

- `GET /api/calendar/events?month=YYYY-MM` を追加
- フロー
  1. 認証ユーザー確認
  2. Google APIクライアント取得
  3. `calendarList.list` で対象カレンダー一覧取得
  4. 各カレンダーに対して `events.list` を月範囲で取得
  5. 日付単位へ集約し返却
- エラー設計
  - スコープ不足: 403 + 明確なメッセージ
  - Google API失敗: 502/500 + 再試行可能メッセージ

### 実装上のポイント

- 1回のリクエストで取りすぎないよう、対象期間は1か月固定
- カレンダー数が多いユーザーに備えて、同時実行数を制限
- `cache: no-store` で最新寄り表示（MVP）

## T3. 一括登録カレンダーUIへの重畳表示

### 変更対象

- `components/shifts/BulkShiftForm.tsx`

### 実装内容

- 月変更時に `/api/calendar/events` を取得
- 日付セルに予定有無マーカーと件数を表示
- 予定読み込み中/失敗時のUIを追加
- 選択状態（シフト入力）と予定表示が視覚衝突しないスタイルに調整

### UI要件（最小）

- 判別しやすい凡例を表示（例: 「Google予定」）
- モバイルでも潰れないレイアウト

## T4. テスト更新

### 変更対象

- `components/shifts/__tests__/bulk-shift-flow.test.tsx`
- 追加候補: `app/api/calendar/events/__tests__/route.test.ts`

### 実装内容

- UIテスト
  - 予定取得成功時にマーカー表示
  - API失敗時も日付選択機能が維持される
- APIテスト
  - 月範囲集約
  - 終日/複数日イベント展開
  - スコープ不足エラー

## 5. 実装以外の操作タスク（運用・設定）

## O1. Google Cloud OAuth設定の更新

- OAuth同意画面で以下の利用範囲を確認
  - `calendar.events.readonly`
  - `calendar.calendarlist.readonly`
- 外部公開形態によっては審査文言更新が必要
- テストユーザー運用の場合は対象ユーザーを見直し

## O2. 既存ユーザー再同意導線

- リリース後、既存ユーザーは再ログインで再同意が必要
- UI文言例
  - 「全カレンダー予定表示を使うにはGoogle連携の再同意が必要です」

## O3. 段階リリース手順

1. バックエンド（スコープ/新API）先行リリース
2. 再同意導線確認
3. UI公開
4. エラー率とGoogle API quota監視

## 6. リスクと対策

- リスク: カレンダー数が多いユーザーでAPI遅延
  - 対策: 期間1か月固定、同時実行数制限、件数上限
- リスク: スコープ不足ユーザーで機能停止
  - 対策: 予定表示のみ非致命化（シフト登録は継続可能）
- リスク: 予定件数が多くUIが見づらい
  - 対策: セル内は件数表示中心、詳細は簡易ポップアップに分離

## 7. 受け入れ条件

- `/my/shifts/bulk` で表示中月のGoogle予定が全カレンダー分表示される
- 予定表示に失敗しても、一括登録の主要操作（選択/入力/登録）は継続可能
- スコープ不足時に再同意が必要なことをユーザーが理解できる
- `pnpm exec tsc --noEmit` と `pnpm lint` が通る

## 8. 実行順（推奨）

1. T1（スコープ拡張）
2. O1（Google Cloud設定確認）
3. T2（予定取得API）
4. T3（UI統合）
5. T4（テスト）
6. O2/O3（再同意導線と段階リリース）

## 9. 今回作業メモ

- 作業ブランチ: `feat/bulk-all-google-calendars-plan`
- このドキュメントは「実装前の洗い出し」を目的とする
- まだコード実装・挙動変更は行っていない
