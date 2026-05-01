# シフトコメント追加 実装計画

作成日: 2026-05-01

## 1. 目的

`Shift` に任意入力の「コメント」を追加し、登録・編集・一覧・ダッシュボード・Google Calendar 同期に反映する。

このコメントは、勤務先名だけでは区別しづらい勤務内容を短く補足するための表示用ラベルとして扱う。データの正はアプリ DB とし、Google Calendar 側で編集された内容はアプリへ逆同期しない。

## 2. 要件整理

- シフトに `comment` カラムを追加する。
- シフト登録に反映する。
- シフト一括登録に反映する。
- シフト編集に反映する。
- シフト一覧に反映する。
- ダッシュボードのシフト表示に反映する。
- ダッシュボードでは、勤務先名の後ろにコメントを半角スペース + 半角括弧付きで表示する。
- ダッシュボードでは、従来の塾タイプ `NORMAL` シフトの「事務」表記を廃止する。
- Google Calendar 登録・更新時、予定タイトルは勤務先名の後ろにコメントを半角スペース + 半角括弧付きで表示する。
- `comment` が `NULL` の場合、表示名・予定タイトルは勤務先名のみとする。

## 3. 仕様案

### 3.1 データ仕様

`Shift` に以下のフィールドを追加する。

```prisma
comment String? @db.VarChar(100)
```

- 任意入力。
- 未入力、空文字、空白のみは `NULL` として保存する。
- 最大100文字。
- 改行は不可とし、1行テキストとして扱う。
- 給与計算、確定状態、勤務時間計算には影響しない。
- 既存レコードは `NULL` で移行する。

### 3.2 表示名仕様

勤務先表示名は共通関数で生成する。

| comment          | 表示                  |
| ---------------- | --------------------- |
| `NULL`           | `勤務先名`            |
| 空文字・空白のみ | `勤務先名`            |
| `授業補助`       | `勤務先名 (授業補助)` |

従来仕様:

- `workplace.type === CRAM_SCHOOL && shift.shiftType === NORMAL` の場合に `勤務先名（事務）` と表示。

新仕様:

- `shiftType` と `workplace.type` による自動の「事務」表記は廃止する。
- コメントがある場合のみ `勤務先名 (コメント)` と表示する。

### 3.3 Google Calendar 仕様

Google Calendar イベントの `summary` は、アプリ側の勤務先表示名と同じ規則で生成する。

| comment    | summary               |
| ---------- | --------------------- |
| `NULL`     | `勤務先名`            |
| `事務`     | `勤務先名 (事務)`     |
| `授業補助` | `勤務先名 (授業補助)` |

対象:

- シフト単体作成後のイベント作成。
- シフト編集後のイベント更新。
- 一括登録後の各イベント作成。
- 同期失敗後の再試行。

補足:

- Google Calendar 側の既存イベントは、該当シフトを編集または同期再試行したタイミングで新タイトルへ更新される。
- `comment` を削除して `NULL` にした場合、次回イベント更新時に予定タイトルは勤務先名のみへ戻る。
- Google Calendar の `description` にコメントを追加するかは実装時に判断する。最低要件は `summary` への反映。

### 3.4 フォーム仕様

単体登録・編集フォーム:

- `コメント` フィールドを追加する。
- 任意入力。
- 最大100文字。
- プレースホルダー例: `例: 事務、授業補助、研修`
- 編集時は既存コメントを初期表示する。
- 送信時、空文字・空白のみは `null` として扱う。
- コメント入力欄の下に、Google Calendar のイベント名登録イメージをリアルタイム表示する。
- 画面表示形式: `イベント名プレビュー「勤務先名 (コメント)」`
- コメントが未入力の場合の画面表示形式: `イベント名プレビュー「勤務先名」`
- 勤務先未選択の場合は、プレビューを非表示にするか `勤務先を選択するとイベント名を確認できます` と表示する。

一括登録フォーム:

- デフォルト値設定に `デフォルトコメント` を追加する。
- 選択日の詳細入力に `コメント` を追加する。
- `デフォルト値を適用` 実行時、各選択日のコメントへデフォルトコメントを反映する。
- 各日付ごとにコメントを上書きできる。
- 未入力、空文字、空白のみは `null` として保存する。
- `デフォルトコメント` 入力欄の下に、デフォルト値適用時の `イベント名プレビュー「勤務先名 (コメント)」` をリアルタイム表示する。
- 各日付の `コメント` 入力欄の下に、その日付で登録される `イベント名プレビュー「勤務先名 (コメント)」` をリアルタイム表示する。
- 各日付のプレビューは、個別コメントを編集した時点で即時更新する。
- デフォルト値を適用した場合、各日付のプレビューも適用後のコメントで更新する。

## 4. 影響範囲

### 4.1 DB / Prisma

- `prisma/schema.prisma`
  - `Shift.comment String? @db.VarChar(100)` を追加。
- Prisma Client 生成物
  - `prisma generate` が必要。
  - このリポジトリの運用上、エージェントは `prisma generate` / `prisma migrate dev` を実行しない。実装時はスキーマ変更後に一旦停止し、ユーザー実行コマンドを依頼する。
- Migration
  - 想定名: `add_shift_comment`
  - 既存データへの影響は nullable カラム追加のみ。

### 4.2 API

- `app/api/shifts/_shared.ts`
  - `shiftInputSchema` に `comment` を追加。
  - `buildShiftData` で trim と `null` 正規化を行う。
  - `BuiltShiftData.shiftData` に `comment` を含める。
- `app/api/shifts/route.ts`
  - 単体作成と一覧レスポンスに `comment` を含める。
- `app/api/shifts/[id]/route.ts`
  - 詳細取得・更新レスポンスに `comment` を含める。
- `app/api/shifts/bulk/route.ts`
  - 一括登録 item schema に `comment` を追加。
  - `createMany` の投入データに `comment` を含める。
- `app/api/shifts/unconfirmed/route.ts`
  - 未確定シフトレスポンスに `comment` を含める。
- `app/api/shifts/confirmed-current-month/route.ts`
  - 確定済みシフトレスポンスに `comment` を含める。
- `app/api/shifts/[id]/confirm/route.ts`
  - 確定処理自体はコメントを変更しない。
  - Google Calendar 更新用に取得される `Shift` に `comment` が含まれることを確認する。

### 4.3 UI / Hooks

- `components/shifts/ShiftForm.tsx`
  - `ShiftDetail` / `FormState` / バリデーション / 初期値 / payload に `comment` を追加。
  - 登録・編集フォームに `コメント` 入力を追加。
  - コメント入力欄の下に `イベント名プレビュー「勤務先名 (コメント)」` を追加し、勤務先・コメント変更時にリアルタイム更新する。
- `components/shifts/BulkShiftForm.tsx`
  - default state、row state、validation、payload、UI に `comment` を追加。
  - デフォルトコメント欄と各日付コメント欄の下に `イベント名プレビュー「勤務先名 (コメント)」` を追加する。
  - デフォルト値適用時に各日付のプレビューも更新する。
- `hooks/use-month-shifts.ts`
  - `MonthShift.comment` を追加。
  - API レスポンス正規化とキャッシュに反映。
- `components/calendar/MonthCalendar.tsx`
  - tooltip 表示を `勤務先名 (コメント)` に変更。
- `components/calendar/ShiftListModal.tsx`
  - 勤務先表示を `勤務先名 (コメント)` に変更。
- `components/dashboard/dashboard-page-client.tsx`
  - `MonthCalendar` / `ShiftListModal` に渡す `MonthShift` 経由で反映。
- `components/shifts/shift-list-page-client.tsx`
  - 一覧の勤務先表示と勤務先ソートを `勤務先名 (コメント)` ベースへ変更。
  - 必要なら独立した `コメント` 列を追加する。ただし初期実装では勤務先表示に半角スペース + 半角括弧付きで含め、列増加による横幅悪化を避ける。
- `components/shifts/shift-confirm-page-client.tsx`
  - API レスポンス型と画面用型変換に `comment` を追加。
- `components/shifts/ConfirmShiftCard.tsx`
  - 未確定シフトの勤務先表示を `勤務先名 (コメント)` に変更。
- `components/shifts/ConfirmedShiftsList.tsx`
  - 確定済みシフトの各行にコメントを表示する。
  - 勤務先ごとグルーピングは従来どおり `workplace.id` 単位を維持する。
- `components/shifts/shift-confirmation-types.ts`
  - 未確定・確定済みシフト型に `comment` を追加。

### 4.4 表示共通化

- `lib/shifts/format.ts`
  - 既存の「塾 NORMAL = 事務」ロジックを削除する。
  - `comment` を受け取り、空でなければ `勤務先名 (コメント)` を返す。
  - 関数名は既存の `formatShiftWorkplaceLabel` を維持して呼び出し側の変更を最小化するか、`formatShiftDisplayTitle` などへ改名する。
  - 初期実装では既存関数名維持を推奨する。

### 4.5 Google Calendar

- `lib/google-calendar/syncEvent.ts`
  - `summary: workplace.name` を共通表示関数によるタイトルへ変更。
  - `createCalendarEvent` / `updateCalendarEvent` の両方に適用。
  - `extendedProperties.private` に `comment` を追加するかは任意。逆同期しないため必須ではない。
- `lib/google-calendar/syncStatus.ts`
  - 同期対象シフト取得時に `comment` が Prisma 型として利用できることを確認する。
  - 明示 select がある箇所で `comment` が落ちないか確認する。

### 4.6 テスト

更新対象:

- `components/shifts/__tests__/shift-flow.test.tsx`
  - 単体登録・編集 payload に `comment` が含まれること。
  - 空コメントが `null` または未入力相当になること。
  - コメント入力に応じて `イベント名プレビュー「勤務先名 (コメント)」` がリアルタイム更新されること。
- `components/shifts/__tests__/bulk-shift-flow.test.tsx`
  - デフォルトコメント適用。
  - 日付ごとのコメント上書き。
  - 一括 API payload に `comment` が含まれること。
  - デフォルトコメント欄と各日付コメント欄の `イベント名プレビュー「勤務先名 (コメント)」` が更新されること。
- `components/shifts/__tests__/shift-list-page-client.test.tsx`
  - 勤務先表示が `勤務先名 (コメント)` になること。
  - 塾 NORMAL シフトでもコメントなしなら ` (事務)` が表示されないこと。
- `components/shifts/__tests__/confirm-shift-flow.test.tsx`
  - 未確定・確定済み表示にコメントが反映されること。
- `lib/google-calendar` 周辺の既存テストがあれば追加。
  - なければ `formatShiftWorkplaceLabel` のユニットテスト追加を優先する。

## 5. 実装順序

1. 設計書更新
   - `docs/DESIGN_SPECIFICATION.md` の `Shift` 属性、画面仕様、Google Calendar マッピング、バリデーションを更新する。
   - 必要に応じて `docs/IMPLEMENTATION_TASKS.md` に追加タスクを記載する。
2. Prisma スキーマ変更
   - `prisma/schema.prisma` に `comment` を追加する。
   - ここで一旦停止し、ユーザーに以下の実行を依頼する。
   - `pnpm prisma migrate dev --name add_shift_comment`
   - `pnpm prisma generate`
3. API 変更
   - 単体作成・更新・一覧・詳細・一括登録・未確定/確定済み取得に `comment` を通す。
   - 空文字正規化は API 共通層で行い、UI ごとの差異を避ける。
4. 表示共通関数変更
   - `lib/shifts/format.ts` の「事務」自動付与を廃止し、半角スペース + 半角括弧表示へ置換する。
5. UI 変更
   - 単体登録・編集フォーム。
   - 一括登録フォーム。
   - ダッシュボード、カレンダーモーダル、シフト一覧、シフト確定画面。
6. Google Calendar 同期変更
   - `createCalendarEvent` / `updateCalendarEvent` の `summary` をコメント対応タイトルに変更する。
7. テスト更新
   - 表示、payload、Google Calendar タイトル生成のテストを追加・更新する。
8. 検証
   - `pnpm exec tsc --noEmit`
   - `pnpm lint`
   - `pnpm format`

## 6. 完了条件

- `Shift.comment` が DB・Prisma 型・API レスポンスに反映されている。
- 単体登録・編集でコメントを保存・更新・削除できる。
- 一括登録でデフォルトコメント適用と日付ごとの上書きができる。
- 各種フォームで、コメント欄の下に `イベント名プレビュー「勤務先名 (コメント)」` がリアルタイム表示される。
- コメントありのシフトが `勤務先名 (コメント)` と表示される。
- コメントなしのシフトは勤務先名のみ表示される。
- 塾 NORMAL シフトでも、コメントなしなら `勤務先名 (事務)` と表示されない。
- Google Calendar の作成・更新イベントタイトルがコメント表示規則に一致する。
- 型チェック・Lint・Format が通る。

## 7. 保留・確認事項

- コメント最大長は初期案として100文字にする。表示用ラベルとしての用途を超える長文メモが必要な場合は別途 `memo` 的なフィールドとして再設計する。
- Google Calendar `description` にコメントを入れるかは必須要件外。タイトル反映を優先し、必要なら後続で追加する。
- シフト一覧に独立した `コメント` 列を追加するかは UI 幅と可読性を見て判断する。初期案では勤務先表示に含める。
- 既存 Google Calendar イベントの一括再同期は今回の初期実装に含めない。編集または再試行時に順次反映する。
