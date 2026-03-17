# 実装タスク分割書

**目的**: DESIGN_SPECIFICATION.md に基づいて、実装可能な粒度に分割したタスク一覧。
各タスクは **レビュー可能な単位** で、依存関係を含む。

**対象システム**: Shifta（個人用シフト・給与管理Webアプリ）

---

## 1. タスク体系

### Phase 1: プロジェクト基盤 (Foundation) ✅

✅ T1-1: Prismaスキーマ定義 - 認証部実装済み（Workplace, Shift等は後続
✅ T1-2: データベース初期化 - 実装済み
✅ T1-3: 型定義ファイル生成 - 実装済み

### Phase 2: 認証 (Authentication) ✅

✅ T2-1: NextAuth.js 設定 - 実装済み（Googleプロバイダー）
✅ T2-2: ログイン画面 (SCR_001) UI実装 - 実装済み
✅ T2-3: 認証ミドルウェア・ガード実装 - 実装済み

### Phase 3: ドメインモデルAPI基本 (Core Models & APIs)

- T3-1: User CRUD API
- T3-2: Workplace CRUD API
- T3-3: PayrollRule CRUD API
- T3-4: Timetable CRUD API
- T3-5: Shift CRUD API（基本）
- T3-6: ShiftLessonRange API

### Phase 4: UIコンポーネント基本 (UI Foundation)

- T4-1: レイアウトテンプレート・ナビゲーション
- T4-2: フォームコンポーネント（shadcn/ui利用）
- T4-3: モーダルコンポーネント
- T4-4: テーブルコンポーネント

### Phase 5: カレンダー機能 (Calendar)

- T5-1: カレンダーコンポーネント実装（色付き丸、本日ハイライト）
- T5-2: SCR_002 ダッシュボード実装
- T5-3: SCR_003 カレンダー表示実装
- T5-4: シフト一覧モーダル実装

### Phase 6: シフト管理CRUD (Shift Management)

- T6-1: SCR_004 シフト入力フォーム実装
- T6-2: SCR_005 シフト編集フォーム実装
- T6-3: SCR_006 シフト削除確認ダイアログ実装
- T6-4: シフト入力フロー統合テスト

### Phase 7: ビジネスロジック (Business Logic)

- T7-1: 給与計算エンジン実装（NORMAL/OTHER型）
- T7-2: 給与計算エンジン実装（LESSON型）
- T7-3: 勤務時間分類ロジック（深夜、残業判定）
- T7-4: 給与計算ユニットテスト

### Phase 8: 給与集計・レポート (Payroll Summary)

- T8-1: 給与集計API実装
- T8-2: SCR_007 給与集計表示UI実装
- T8-3: 期間集計ロジック実装

### Phase 9: 設定管理 (Configuration Management)

- T9-1: SCR_008/009 勤務先管理実装
- T9-2: SCR_010/011 給与ルール管理実装
- T9-3: SCR_012/013 塾時間割管理実装（CRAM_SCHOOL型のみ）

### Phase 10: Google Calendar連携 (External Integration)

- T10-1: Google Calendar API クライアント実装
- T10-2: イベント作成・更新・削除ロジック実装
- T10-3: 同期ステータス管理

### Phase 11: シフト一括登録 (Bulk Registration)

- T11-1: SCR_014 一括登録UI実装（勤務先選択+カレンダー+デフォルト値設定）
- T11-2: 一括登録API実装
- T11-3: 一括登録エンドツーエンドテスト

### Phase 12: 統合テスト・ポーリッシング (Integration & Polish)

- T12-1: エンドツーエンドテスト（主要フロー）
- T12-2: パフォーマンス最適化（N+1クエリ対策）
- T12-3: エラーハンドリング・ユーザーメッセージ改善
- T12-4: ドキュメント整備

---

## 2. 詳細タスク仕様（実装対象のみ）

✅ **Phase 1-2 は実装済みのため省略**

---

## **Phase 1.5: Prismaスキーマ拡張 (ドメインモデル追加)**

### **T1-4: Prismaスキーマに業務モデルを追加**

**概要**: Prismaスキーマに Workplace, PayrollRule, Timetable, Shift, ShiftLessonRange を追加。

**実装対象**:

- `prisma/schema.prisma` に以下のモデルを追加：
  - Workplace（勤務先）
  - PayrollRule（給与ルール）
  - Timetable（塾時間割）
  - Shift（シフト）
  - ShiftLessonRange（授業コマ範囲）

**スキーマ要件**（DESIGN_SPECIFICATION.mdの3章参照）:

- Workplace: id, userId (FK), name, type (enum), color, createdAt
- PayrollRule: id, workplaceId (FK), startDate, endDate, baseHourlyWage, perLessonWage, holidayHourlyWage, nightMultiplier, overtimeMultiplier, nightStart, nightEnd, dailyOvertimeThreshold, holidayType
- Timetable: id, workplaceId (FK), type (enum: NORMAL|INTENSIVE), period (int), startTime, endTime
  - 制約: (workplaceId, type, period) の複合一意性
- Shift: id, workplaceId (FK), date, startTime, endTime, breakMinutes, shiftType (enum: NORMAL|LESSON|OTHER), googleEventId, createdAt
- ShiftLessonRange: id, shiftId (FK), startPeriod, endPeriod
  - 制約: 1シフト = 1レコード

**DONE条件**:

- スキーマ定義完了
- `prisma generate` でエラーなし
- `prisma migrate dev --name add_business_models` で新マイグレーション作成
- Neon上でテーブル作成確認

**参照ドキュメント**: DESIGN_SPECIFICATION.md - 3. ドメインモデル

---

## **Phase 3: ドメインモデルAPI基本 (Core Models & APIs)**

### **T3-1: User CRUD API**

**概要**: User エンティティのCreate・Read・Updateエンドポイント。

**APIエンドポイント**:

- `POST /api/users` - ユーザー作成（自動、ログイン時）
- `GET /api/users/me` - 現在のユーザー情報取得
- `PUT /api/users/me` - ユーザー情報更新

**実装対象**:

- `app/api/users/route.ts`
- `app/api/users/me/route.ts`

**バリデーション**:

- メール形式
- 認証確認

**DONE条件**:

- 各エンドポイントが正常に動作
- 必須フィールドが機能
- エラーハンドリングが適切

**参照**: DESIGN_SPECIFICATION.md - 3.1 User

---

### **T3-2: Workplace CRUD API**

**概要**: Workplace エンティティのCRUD。

**APIエンドポイント**:

- `POST /api/workplaces` - 勤務先作成
- `GET /api/workplaces` - 勤務先一覧（ユーザーのもの）
- `GET /api/workplaces/:id` - 勤務先取得
- `PUT /api/workplaces/:id` - 勤務先更新
- `DELETE /api/workplaces/:id` - 勤務先削除（Cascade）

**バリデーション**:

- workplaceId の userId 確認（不正アクセス防止）
- name は1～50文字
- type は GENERAL or CRAM_SCHOOL
- color は HEX (#RRGGBB)
- 削除時に関連 Shift, PayrollRule, Timetable を確認（警告）

**DONE条件**:

- CRUD 全操作が動作
- ユーザー隔離が機能
- バリデーション表示

**参照**: DESIGN_SPECIFICATION.md - 3.2 Workplace

---

### **T3-3: PayrollRule CRUD API**

**概要**: PayrollRule エンティティのCRUD。

**APIエンドポイント**:

- `POST /api/workplaces/:workplaceId/payroll-rules` - ルール作成
- `GET /api/workplaces/:workplaceId/payroll-rules` - ルール一覧
- `GET /api/workplaces/:workplaceId/payroll-rules/:id` - ルール取得
- `PUT /api/workplaces/:workplaceId/payroll-rules/:id` - ルール更新
- `DELETE /api/workplaces/:workplaceId/payroll-rules/:id` - ルール削除

**バリデーション**:

- startDate < endDate（存在する場合）
- endDate は NULLか startDate より後
- baseHourlyWage > 0（GENERAL型）
- perLessonWage > 0（CRAM_SCHOOL型）
- 同一勤務先内での期間重複チェック（警告）

**DONE条件**:

- CRUD 全操作
- 期間重複警告表示
- 型別パラメータ検証

**参照**: DESIGN_SPECIFICATION.md - 3.3 PayrollRule

---

### **T3-4: Timetable CRUD API**

**概要**: Timetable エンティティのCRUD（CRAM_SCHOOL のみ）。

**APIエンドポイント**:

- `POST /api/workplaces/:workplaceId/timetables` - 時間割作成
- `GET /api/workplaces/:workplaceId/timetables` - 時間割一覧
- `PUT /api/workplaces/:workplaceId/timetables/:id` - 時間割更新
- `DELETE /api/workplaces/:workplaceId/timetables/:id` - 時間割削除

**バリデーション**:

- workplaceId の type = CRAM_SCHOOL確認
- (workplaceId, type, period) 複合一意性チェック
- startTime < endTime
- period は正の整数

**DONE条件**:

- CRAM_SCHOOL 勤務先のみ操作可能
- 複合一意性が機能
- 型別パラメータ（NORMAL/INTENSIVE）

**参照**: DESIGN_SPECIFICATION.md - 3.4 Timetable

---

### **T3-5: Shift CRUD API（基本）**

**概要**: Shift エンティティのCRUD（Google Calendar同期なし、基本CRUD）。

**APIエンドポイント**:

- `POST /api/shifts` - シフト作成（Google Calendar同期なし）
- `GET /api/shifts` - シフト一覧（期間フィルタ可）
- `GET /api/shifts/:id` - シフト取得
- `PUT /api/shifts/:id` - シフト更新（基本）
- `DELETE /api/shifts/:id` - シフト削除（ShiftLessonRange自動削除）

**バリデーション**:

- workplaceId の userId 確認
- shiftType = LESSON 場合、ShiftLessonRange 必須
- shiftType ≠ LESSON 場合、ShiftLessonRange 非作成
- 時刻: startTime < endTime（同日内or次日跨ぎ）
- breakMinutes ≥ 0

**DONE条件**:

- CRUD 全操作
- ShiftLessonRange 連動
- 違場パターン生成エラー表示

**参照**: DESIGN_SPECIFICATION.md - 3.5 Shift

---

### **T3-6: ShiftLessonRange API**

**概要**: ShiftLessonRange（授業コマ範囲）の管理。

**実装対象**:

- Shift 作成時に ShiftLessonRange を自動生成
- startPeriod, endPeriod の Timetable 参照確認
- 削除時に ShiftLessonRange も削除

**バリデーション**:

- shift.shiftType = LESSON のみ
- startPeriod ≤ endPeriod
- period は該当 Timetable に存在
- type（NORMAL/INTENSIVE）が統一

**DONE条件**:

- Shift + ShiftLessonRange が一体で動作
- コマ範囲計算が正確

**参照**: DESIGN_SPECIFICATION.md - 3.6 ShiftLessonRange

---

## **Phase 4: UIコンポーネント基本 (UI Foundation)**

### **T4-1: レイアウトテンプレート・ナビゲーション**

**概要**: ホームレイアウト（認証済みユーザー用）、左サイドバーナビゲーション、ヘッダー。

**実装対象**:

- `app/my/layout.tsx` - 認証済みユーザーレイアウト（現在のルートレイアウトは既存）
- サイドバーナビゲーション（shadcn/ui Sidebar or Drawer）

**ナビゲーション項目**（DESIGN_SPECIFICATION.md - 2.1参照）:

- Dashboard
- Calendar
- Payroll Summary
- Workplace Management
- Payroll Rules
- Timetable (CRAM_SCHOOL のみ後で条件表示)
- Settings
- Bulk Registration

**要件**:

- レスポンシブデザイン（モバイル: ドロワー、デスクトップ: 固定）
- 現在ページのナビ項目をハイライト
- ログアウトボタン

**DONE条件**:

- ページ遷移時にナビ項目がハイライト
- ログアウト機能
- モバイル・デスクトップ両対応

---

### **T4-2: 追加UIコンポーネント（shadcn/ui利用）**

**概要**: Button以外の共通フォーム部品の実装。

**実装対象**:

- shadcn/ui `Form`, `Input`, `Select`, `Checkbox`, `Radio`, `DatePicker`, `TimePicker` 等の導入
- カスタムhookの実装（`useFormWithValidation` など）
- エラーメッセージ表示コンポーネント

**要件**:

- TypeScript strict 対応
- エラー表示の一貫性
- コンデンサな API

**DONE条件**:

- shadcn/ui コンポーネントが正常に import 可能
- 型安全性が保証
- ESLint エラーなし

---

### **T4-3: モーダルコンポーネント**

**概要**: 汎用モーダルテンプレート。

**実装対象**:

- shadcn/ui `Dialog` を使用したモーダルテンプレート
- `useModal` hook の実装
- 確認ダイアログレイアウト

**用途**:

- シフト一覧モーダル
- 削除確認ダイアログ
- フォーム入力

**DONE条件**:

- モーダル開く/閉じるが機能
- Escキーで閉じられる
- フォーム送信時に自動クローズ

---

### **T4-4: テーブルコンポーネント**

**概要**: shadcn/ui `DataTable` を使用した共通テーブル。

**実装対象**:

- ページング、ソート、フィルタ機能
- レスポンシブ対応

**用途**:

- シフト一覧
- 勤務先一覧
- 給与ルール一覧
- 給与集計表

**DONE条件**:

- テーブル表示・编集・削除が機能
- ページング・ソート動作

---

## **Phase 5: カレンダー機能 (Calendar)**

### **T5-1: カレンダーコンポーネント実装（色付き丸、本日ハイライト）**

**概要**: 月間カレンダーUIコンポーネント（Shift インジケーターあり）。

**実装対象**:

- `components/calendar/MonthCalendar.tsx`
- 日付セルコンポーネント
- シフトインジケーター（色付き丸）

**UI仕様**（DESIGN_SPECIFICATION.md - 5.2 / 9.3参照）:

- **形式**: 月間カレンダー（日曜始まり）
- **シフト表示**: 日付下に色付き丸を表示
  - 1シフト = 1丸
  - 複数シフト = 複数丸（横並び）
  - 5件超 = 色丸3個 + "+N" テキスト
- **本日ハイライト**: 背後に半透明塗りつぶし丸
- **インタラクション**: 日付クリック → 詳細表示

**Props**:

- `month`: 表示月
- `shifts`: Shift データ配列（その月のみ）
- `onDateClick`: クリック時のコールバック
- `onNavigatePrev/Next`: 月ナビゲーション

**DONE条件**:

- カレンダー表示が正確（日曜始まり、月初・月末正確）
- 色付き丸表示が正確（勤務先.color対応）
- 本日ハイライト表示
- 日付クリック時にコールバック実行

**参照**: DESIGN_SPECIFICATION.md - 5. カレンダーUI / 9.3 SCR_003

---

### **T5-2: SCR_002 ダッシュボード実装**

**概要**: ホーム画面（ダッシュボード）。月別カレンダー表示、簡易統計、ナビゲーションハブ。

**実装対象**:

- `app/my/page.tsx`
- 当月カレンダー表示
- 簡易统计（今月の給与予想、勤務時間）
- ショートカットボタン

**要件**:

- カレンダーコンポーネント埋め込み（T5-1）
- 当月給与・勤務時間をAPIから取得・表示
- 「新規シフト登録」「一括登録」ボタン

**DONE条件**:

- ページが表示
- カレンダーが表示
- 統計が正確に計算

---

### **T5-3: SCR_003 カレンダー表示実装**

**概要**: 専用カレンダーページ。月ナビゲーション、前月・次月移動。

**実装対象**:

- `app/my/calendar/page.tsx`
- カレンダーコンポーネント埋め込み
- 月ナビゲーション（前月・次月ボタン）
- 月選択ピッカー

**DONE条件**:

- 前月・次月へ移動可能
- 月選択ピッカーが機能
- シフト表示が最新に更新

---

### **T5-4: シフト一覧モーダル実装**

**概要**: カレンダーの日付クリック時に表示されるモーダル。その日のシフト一覧、操作ボタン。

**実装対象**:

- `components/calendar/ShiftListModal.tsx`
- その日のシフト一覧テーブル（時刻、勤務先、給与予想）
- 「新規追加」「編集」「削除」ボタン

**インタラクション**:

- 行クリック → 編集ページ（T6-2）へ遷移
- 「新規追加」→ 入力フォーム（T6-1）へ遷移
- 「削除」→ 削除確認（T6-3） → 実行

**DONE条件**:

- モーダルが表示
- シフト一覧が正確
- ボタンが機能

---

## **Phase 6: シフト管理CRUD (Shift Management)**

### **T6-1: SCR_004 シフト入力フォーム実装**

**概要**: 新規シフト登録フォーム。NORMAL・LESSON型の分岐、時刻入力またはコマ選択。

**実装対象**:

- `app/my/shifts/new/page.tsx` または `/my/calendar` のモーダル
- フォーム定義（DESIGN_SPECIFICATION.md - 9.3 SCR_004参照）
- 条件付き必須フィールド表示

**フォーム入力**:

1. **勤務先** (SELECT): 登録済み勤務先から選択
2. **日付** (DATE): カレンダーピッカーまたは手入力
3. **シフトタイプ** (RADIO): NORMAL / LESSON / OTHER
4. **条件付き表示**:
   - NORMAL/OTHER型: 開始時刻、終了時刻、休憩時間
   - LESSON型: コマ種別（NORMAL/INTENSIVE）、コマ範囲

**バリデーション**（DESIGN_SPECIFICATION.md - 9.3 SCR_004参照）:

- ERR_001: 必須項目
- ERR_002: 時刻妥当性
- ERR_003: 同日シフト重複（警告）
- ERR_004: 時間割未登録（LESSON型で）

**サーバー側**:

- LESSON型の場合、Timetable から自動計算 (startTime, endTime)
- ShiftLessonRange 作成

**DONE条件**:

- フォーム表示・入力が機能
- バリデーションが表示
- 送信後 API (`POST /api/shifts`) が実行
- 成功後 `/my/calendar` へリダイレクト

**参照**: DESIGN_SPECIFICATION.md - 9.3 SCR_004、4.1 UC-001

---

### **T6-2: SCR_005 シフト編集フォーム実装**

**概要**: 既存シフト編集フォーム。SCR_004 と同様だが、初期値をプリセット。

**実装対象**:

- `app/my/shifts/:id/edit/page.tsx` または モーダル
- 既存シフト取得・プリセット
- 更新時の差分検出（オプション）

**フロー**:

1. `GET /api/shifts/:id` で既存シフト取得（ShiftLessonRange 含む）
2. フォーム初期化
3. ユーザー編集後 PUT /api/shifts/:id で更新
4. 成功後 `/my/calendar` へ戻る

**DONE条件**:

- 既存シフト情報が正確に表示
- 編集後 API が実行
- 成功後戻る

**参照**: DESIGN_SPECIFICATION.md - 9.3 SCR_005、4.2 UC-002

---

### **T6-3: SCR_006 シフト削除確認ダイアログ実装**

**概要**: 削除確認ダイアログ。「本当に削除?」→ 実行。

**実装対象**:

- `components/shifts/DeleteConfirmDialog.tsx`
- ダイアログテンプレート（T4-3 の応用）
- 「削除」「キャンセル」ボタン

**フロー**:

1. ユーザー「削除」クリック → ダイアログ表示
2. 「削除」確認 → DELETE /api/shifts/:id 実行
3. 成功 → `/my/calendar` へリダイレクト、成功メッセージ表示

**DONE条件**:

- ダイアログ表示
- 削除実行
- 戻る

**参照**: DESIGN_SPECIFICATION.md - 4.3 UC-003

---

### **T6-4: シフト入力フロー統合テスト**

**概要**: シフト作成・編集・削除の統合テスト。

**テスト項目**:

1. 新規NORMAL型シフト作成
2. 編集・保存
3. 削除確認・実行

**ツール**: Jest + React Testing Library

**DONE条件**:

- テスト成功率 100%
- E2E フロー動作确認

---

## **Phase 7: ビジネスロジック (Business Logic)**

### **T7-1: 給与計算エンジン実装（NORMAL/OTHER型）**

**概要**: NORMAL/OTHER型のシフトの給与計算ロジック。

**実装対象**:

- `lib/payroll/calculateShiftWage.ts`
- 関数: `calculateOtherShiftWage(shift: Shift, payrollRule: PayrollRule): PayrollResult`

**ロジック**（DESIGN_SPECIFICATION.md - 8.3参照）:

1. 実勤務時間 H_total = (endTime - startTime - breakMinutes) / 60
2. 深夜勤務時間 H_night = nightStart～nightEnd の重複時間
3. 日中勤務時間 H_day = H_total - H_night
4. 残業時間 H_overtime = max(0, H_total - dailyOvertimeThreshold)
5. 基本給 = H_day × baseHourlyWage
6. 残業給 = H_overtime × baseHourlyWage × overtimeMultiplier
7. 深夜割増給 = H_night × baseHourlyWage × (nightMultiplier - 1)
8. **合計** = 基本給 + 残業給 + 深夜割増給（簡略版、深夜残業の複雑な計算は後で）

**入力**:

- Shift (date, startTime, endTime, breakMinutes)
- PayrollRule (baseHourlyWage, nightStart, nightEnd, dailyOvertimeThreshold, overtimeMultiplier, nightMultiplier)

**出力**:

- PayrollResult (totalWage, dayWage, overtimeWage, nightWage, workHours, overtimeHours, nightHours)

**Edge Cases**:

- 翌日にまたがるシフト（22:00 ～ 05:00）
- 深夜帯が残業と重複
- 休日判定（holidayType）→ holidayHourlyWage を使用

**DONE条件**:

- ユニットテスト成功（後述T7-4で）
- 具体例（DESIGN_SPECIFICATION.md - 8.4例1, 例2）の計算結果が正確
- エッジケース処理

**参照**: DESIGN_SPECIFICATION.md - 8.3.2

---

### **T7-2: 給与計算エンジン実装（LESSON型）**

**概要**: LESSON型（塾授業）の給与計算。

**実装対象**:

- `lib/payroll/calculateLessonShiftWage.ts`
- 関数: `calculateLessonShiftWage(shift: Shift, shiftLessonRange: ShiftLessonRange, payrollRule: PayrollRule): PayrollResult`

**ロジック**（DESIGN_SPECIFICATION.md - 8.3.2参照）:

- コマ数 = endPeriod - startPeriod + 1
- **給与** = コマ数 × perLessonWage

**入力**:

- Shift (date, shiftType = LESSON)
- ShiftLessonRange (startPeriod, endPeriod)
- PayrollRule (perLessonWage)

**出力**:

- PayrollResult (totalWage, lessonCount)

**DONE条件**:

- ユニットテスト成功
- 具体例（DESIGN_SPECIFICATION.md - 8.4例3）の計算が正確

**参照**: DESIGN_SPECIFICATION.md - 8.3.2

---

### **T7-3: 勤務時間分類ロジック（深夜、残業判定）**

**概要**: 共通ロジック: 深夜・残業・休日判定。

**実装対象**:

- `lib/payroll/timeClassification.ts`
- 関数: `calculateNightHours(startTime, endTime, nightStart, nightEnd): number`
- 関数: `calculateOvertimeHours(totalHours, threshold): number`
- 関数: `isHolidayDate(date: Date, holidayType: HolidayType): boolean`

**DONE条件**:

- 各関数がユニットテスト成功
- エッジケース（日跨ぎ、複雑な時刻）対応

---

### **T7-4: 給与計算ユニットテスト**

**概要**: T7-1, T7-2, T7-3 のユニットテスト。

**実装対象**:

- `lib/payroll/__tests__/calculateShiftWage.test.ts`
- `lib/payroll/__tests__/calculateLessonShiftWage.test.ts`
- `lib/payroll/__tests__/timeClassification.test.ts`

**テストケース** (DESIGN_SPECIFICATION.md - 8.4 の具体例を使用):

- 例1: 通常勤務（NORMAL）→ 給与 7,700円
- 例2: 夜勤（深夜割増）→ 給与 9,750円
- 例3: 塾授業（LESSON）→ 給与 6,000円

**DONE条件**:

- テスト成功率 100%
- カバレッジ > 90%

---

## **Phase 8: 給与集計・レポート (Payroll Summary)**

### **T8-1: 給与集計API実装**

**概要**: 期間別給与集計API。

**APIエンドポイント**:

- `GET /api/payroll/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

**レスポンス**:

```json
{
  "totalWage": 150000,
  "totalWorkHours": 120,
  "totalNightHours": 10,
  "totalOvertimeHours": 5,
  "byWorkplace": [
    {
      "workplaceId": "...",
      "workplaceName": "店舗A",
      "workplaceColor": "#FF5733",
      "wage": 80000,
      "workHours": 60
    }
  ],
  "previousMonthWage": 145000,
  "currentMonthCumulative": 150000,
  "yearlyTotal": 750000
}
```

**ロジック**:

1. 期間内の Shift を取得
2. 各 Shift ごとに PayrollRule を該当期間で選択
3. T7-1 or T7-2 で給与計算
4. 合計・集計

**DONE条件**:

- API 動作
- 計算正確

---

### **T8-2: SCR_007 給与集計表示UI実装**

**概要**: 給与集計結果を視覚的に表示。

**実装対象**:

- `app/my/payroll/page.tsx`
- 期間選択（月ピッカー、カスタム期間）
- 集計テーブル・グラフ表示

**表示項目**（DESIGN_SPECIFICATION.md - 9.3 SCR_007参照）:

- 総勤務時間、深夜勤務、残業、概算給与
- 勤務先別内訳
- 前月比、当月累計、年間累計

**UI要件**:

- テーブル形式の勤務先別内訳
- 簡易グラフ（Chart.js or Recharts）
- レスポンシブ

**DONE条件**:

- ページ表示
- 期間選択が機能
- 集計表示が正確

**参照**: DESIGN_SPECIFICATION.md - 9.3 SCR_007

---

### **T8-3: 期間集計ロジック実装**

**概要**: 期間（月、カスタム）の集計最適化。

**実装対象**:

- `lib/payroll/summarizeByPeriod.ts`

**関数**:

- `summarizeByPeriod(shifts: Shift[], payrollRules: PayrollRule[], startDate, endDate): SummaryResult`

**DONE条件**:

- 計算速度 (N+1回避)
- 精度

---

## **Phase 9: 設定管理 (Configuration Management)**

### **T9-1: SCR_008/009 勤務先管理実装**

**概要**: 勤務先のCRUD UI。

**実装対象**:

- `app/my/workplaces/page.tsx` - 一覧（SCR_008）
- `app/my/workplaces/new/page.tsx` - 作成（SCR_009）
- `app/my/workplaces/:id/edit/page.tsx` - 編集（SCR_009）

**SCR_008 - 勤務先一覧**:

- テーブル表示（勤務先名、タイプ、色）
- 「新規追加」ボタン
- 編集・削除アクション

**SCR_009 - 勤務先フォーム**:

- フォーム（DESIGN_SPECIFICATION.md - 9.3 SCR_009参照）
- 「作成」or「保存」ボタン

**DONE条件**:

- CRUD が機能
- バリデーション表示
- 削除時に関連 Shift 警告

**参照**: DESIGN_SPECIFICATION.md - 9.3 SCR_008/009、T3-2 API

---

### **T9-2: SCR_010/011 給与ルール管理実装**

**概要**: 給与ルール（時給設定）のUI。

**実装対象**:

- `app/my/workplaces/:workplaceId/payroll-rules/page.tsx` - 一覧（SCR_010）
- `app/my/workplaces/:workplaceId/payroll-rules/new/page.tsx` - 作成（SCR_011）
- `app/my/workplaces/:workplaceId/payroll-rules/:ruleId/edit/page.tsx` - 編集（SCR_011）

**SCR_010 - 給与ルール一覧**:

- テーブル（適用期間、時給、倍率など）
- 編集・削除

**SCR_011 - 給与ルールフォーム**:

- フォーム（DESIGN_SPECIFICATION.md - 9.3 SCR_011参照）
- 勤務先タイプ別の条件付き表示

**DONE条件**:

- CRUD が機能
- 型別パラメータ（GENERAL/CRAM_SCHOOL）
- 期間重複警告

**参照**: DESIGN_SPECIFICATION.md - 9.3 SCR_010/011、T3-3 API

---

### **T9-3: SCR_012/013 塾時間割管理実装（CRAM_SCHOOL型のみ）**

**概要**: CRAM_SCHOOL 勤務先の時間割（授業コマ）管理。

**実装対象**:

- `app/my/workplaces/:workplaceId/timetables/page.tsx` - 一覧（SCR_012）
- `app/my/workplaces/:workplaceId/timetables/new/page.tsx` - 作成（SCR_013）
- `app/my/workplaces/:workplaceId/timetables/:id/edit/page.tsx` - 編集（SCR_013）

**SCR_012 - 時間割一覧**:

- 通常期、講習期に分けたテーブル表示
- 各コマの時刻
- 編集・削除

**SCR_013 - 時間割フォーム**:

- コマ種別（NORMAL/INTENSIVE）
- コマ番号、開始・終了時刻

**制約**:

- CRAM_SCHOOL勤務先のみ
- (workplaceId, type, period) 複合一意

**DONE条件**:

- CRAM_SCHOOL のみで表示・操作可能
- テーブル表示正確
- 複合一意性チェック

**参照**: DESIGN_SPECIFICATION.md - 9.3 SCR_012/013、T3-4 API

---

## **Phase 10: Google Calendar連携 (External Integration)**

### **T10-1: Google Calendar API クライアント実装**

**概要**: Google Calendar API のクライアントセットアップ。

**実装対象**:

- `lib/google-calendar/client.ts` - Google Calendar API クライアント
- OAuth 2.0 フロー

**要件**:

- NextAuth.js で Google OAuth 連携
- Access Token 管理（Prisma Session で保存）
- API呼び出しヘルパー関数

**DONE条件**:

- Google Calendar API へのアクセスが可能
- トークン管理が機能

---

### **T10-2: イベント作成・更新・削除ロジック実装**

**概要**: Shift ↔ Google Calendar イベント同期ロジック。

**実装対象**:

- `lib/google-calendar/syncEvent.ts`
- 関数: `createCalendarEvent(shift: Shift, gmailUser: string): Promise<string>`（googleEventId 返却）
- 関数: `updateCalendarEvent(googleEventId: string, shift: Shift): Promise<void>`
- 関数: `deleteCalendarEvent(googleEventId: string): Promise<void>`

**イベント属性** (DESIGN_SPECIFICATION.md - 7.3参照):

- title: `[LESSON] 塾B` or `[OTHER] コンビニA` など
- start: ISO 8601 形式
- end: ISO 8601 形式
- color: 勤務先.color → Google Calendar colorId に変換
- extendedProperties: workplaceId などメタデータ

**DONE条件**:

- イベント作成・更新・削除が動作
- Google Calendar で確認可能

---

### **T10-3: 同期ステータス管理**

**概要**: Google Calendar 同期失敗時の処理。

**実装対象**:

- Shift に `googleSyncStatus` フィールド（SUCCESS, FAILED, PENDING）
- エラーメッセージ保存

**エラーハンドリング**:

- API エラー → ステータス = FAILED
- ログ記録、ユーザーへの通知（オプション）
- リトライロジック（将来）

**DONE条件**:

- 同期失敗時も DB 保存
- ステータス表示
- エラーログ記録

---

## **Phase 11: シフト一括登録 (Bulk Registration)**

### **T11-1: SCR_014 一括登録UI実装（勤務先選択+カレンダー+デフォルト値設定）**

**概要**: 複数日のシフトを一括登録する画面。

**実装対象**:

- `app/my/shifts/bulk/page.tsx`

**ステップ1: 勤務先選択**

- SELECT で勤務先選択

**ステップ2: カレンダー&デフォルト値設定**

- 専用カレンダー（複数日選択モード）
- デフォルト値パネル（展開状態、非折畳）:
  - シフトタイプ選択 (NORMAL/LESSON/OTHER)
  - NORMAL/OTHER型: 開始時刻、終了時刻、休憩時間
  - LESSON型: コマ種別（NORMAL/INTENSIVE）、コマ範囲
- 選択日のテーブル（スクロール可能）:
  - 各行で時刻を個別編集可能
  - デフォルト値が自動入力
  - 削除ボタン

**ボタン**:

- 「キャンセル」
- 「確定」→ 一括登録API呼び出し

**DONE条件**:

- ページ表示
- 日付選択が機能
- デフォルト値入力が機能
- 個別編集が可能
- 確定ボタンが動作

**参照**: DESIGN_SPECIFICATION.md - 9.3 SCR_014

---

### **T11-2: 一括登録API実装**

**概要**: 複数 Shift を一括作成するAPI。

**APIエンドポイント**:

- `POST /api/shifts/bulk`

**リクエスト**:

```json
{
  "workplaceId": "...",
  "shifts": [
    {
      "date": "2026-03-20",
      "startTime": "10:00",
      "endTime": "18:00",
      "breakMinutes": 60,
      "shiftType": "NORMAL"
    },
    {
      "date": "2026-03-21",
      "startTime": "16:30",
      "endTime": "19:50",
      "shiftType": "LESSON",
      "startPeriod": 1,
      "endPeriod": 3
    }
  ]
}
```

**処理**:

- 各 Shift を検証
- トランザクション内で全 Shift を作成
- 各 Shift について Google Calendar 同期
- 成功/失敗レスポンス

**DONE条件**:

- API 動作
- トランザクション管理（全成功 or 全失敗）
- Google Calendar 同期

---

### **T11-3: 一括登録エンドツーエンドテスト**

**概要**: 一括登録フロー全体のテスト。

**テストケース**:

1. 複数日選択
2. 各日の時間を編集
3. 確定 → 複数 Shift が作成される

**ツール**: E2E テスト (Playwright)

**DONE条件**:

- テスト成功率 100%

---

## **Phase 12: 統合テスト・ポーリッシング (Integration & Polish)**

### **T12-1: エンドツーエンドテスト（主要フロー）**

**概要**: 主要なユーザーフロー全体の統合テスト。

**テストシナリオ**:

1. ユーザーログイン
2. 勤務先作成
3. 給与ルール設定
4. シフト登録（NORMAL・LESSON両型）
5. カレンダー表示確認
6. 給与集計確認
7. Google Calendar 確認

**ツール**: E2E テスト (Playwright / Cypress)

**DONE条件**:

- テスト成功率 100%

---

### **T12-2: パフォーマンス最適化（N+1クエリ対策）**

**概要**: データベースクエリの最適化。

**実装対象**:

- API レスポンス時間改善
- N+1クエリの検出と修正
- インデックス追加（必要に応じて）

**確認工程**:

- Prisma Debugger で N+1 検出
- ページ読み込み時間測定

**DONE条件**:

- N+1クエリなし
- ページ読み込み ≤ 3秒

---

### **T12-3: エラーハンドリング・ユーザーメッセージ改善**

**概要**: エラーメッセージの充実、エッジケース対応。

**実装対象**:

- バリデーションエラーメッセージの日本語化・詳細化
- ネットワークエラー → ユーザーへの通知
- Google Calendar 同期失敗 →ユーザーへの通知
- タイムアウトエラーハンドリング

**DONE条件**:

- すべてのエラーケースでユーザーに適切な日本語メッセージ表示
- ユーザーが次のアクションを知っている

---

### **T12-4: ドキュメント整備**

**概要**: ユーザードキュメント・開発ドキュメント作成。

**実装対象**:

- README.md - セットアップ・使い方
- API ドキュメント（OpenAPI等）
- 開発ガイド

**DONE条件**:

- ドキュメント完成
- 新規開発者が開始可能

---

## 3. 依存関係マップ

```
✅ Phase 1 (基盤) - 完了
├─ ✅ T1-1: Prisma スキーマ定義 - 認証部実装済み
├─ ✅ T1-2: DB 初期化
└─ ✅ T1-3: 型定義生成

⏳ Phase 1.5 (業務モデル追加) - 次タスク
└─ T1-4: Prisma スキーマに業務モデル追加

✅ Phase 2 (認証) - 完了
├─ ✅ T2-1: NextAuth.js 設定
├─ ✅ T2-2: ログイン UI
└─ ✅ T2-3: 認証ガード

Phase 3 (API) ← T1-4 に依存
├─ T3-1: User CRUD
├─ T3-2: Workplace CRUD
├─ T3-3: PayrollRule CRUD ← T3-2 に依存
├─ T3-4: Timetable CRUD ← T3-2 に依存
├─ T3-5: Shift CRUD
└─ T3-6: ShiftLessonRange ← T3-5 に依存

Phase 4 (UI基本) ← Phase 2 に依存
├─ T4-1: レイアウト・ナビゲーション ← T2-3 に依存
├─ T4-2: フォームコンポーネント
├─ T4-3: モーダル
└─ T4-4: テーブル

Phase 5 (カレンダー) ← Phase 3, 4 に依存
├─ T5-1: カレンダーコンポーネント
├─ T5-2: ダッシュボード ← T5-1 に依存
├─ T5-3: カレンダー表示 ← T5-1 に依存
└─ T5-4: シフト一覧モーダル ← T5-1 に依存

Phase 6 (シフト管理) ← Phase 3, 4, 5 に依存
├─ T6-1: シフト入力 ← T5-4 に依存
├─ T6-2: シフト編集 ← T6-1 に依存
├─ T6-3: 削除確認 ← T6-1 に依存
└─ T6-4: 統合テスト ← T6-1/2/3 に依存

Phase 7 (ビジネスロジック) ← Phase 3 に依存
├─ T7-1: 給与計算（NORMAL/OTHER型）
├─ T7-2: 給与計算（LESSON型）
├─ T7-3: 時間分類ロジック
└─ T7-4: ユニットテスト ← T7-1/2/3 に依存

Phase 8 (給与集計) ← Phase 7 に依存
├─ T8-1: 給与集計API
├─ T8-2: 給与集計UI ← T8-1 に依存
└─ T8-3: 期間集計ロジック ← T8-1 に依存

Phase 9 (設定管理) ← Phase 3, 4 に依存
├─ T9-1: 勤務先管理 ← T3-2 に依存
├─ T9-2: 給与ルール管理 ← T3-3 に依存
└─ T9-3: 塾時間割管理 ← T3-4 に依存

Phase 10 (Google Calendar) ← Phase 6 に依存
├─ T10-1: Google Calendar API クライアント
├─ T10-2: イベント同期ロジック
└─ T10-3: 同期ステータス

Phase 11 (一括登録) ← Phase 6, 7, 10 に依存
├─ T11-1: 一括登録UI
├─ T11-2: 一括登録API
└─ T11-3: E2Eテスト

Phase 12 (統合) ← 全 Phase に依存
├─ T12-1: E2Eテスト
├─ T12-2: パフォーマンス最適化
├─ T12-3: エラーハンドリング
└─ T12-4: ドキュメント
```

---

## 4. 優先実装順序（推奨）

**MVP達成に向けた最短経路** (✅ 完了タスクを除く):

1. ✅ **Phase 1-2 (基盤・認証)** - 完了
2. ⏳ **Phase 1.5** - T1-4: Prisma スキーマに業務モデル追加
3. **Phase 3** (API): T3-1～3-6 - **データ操作API**
4. **Phase 4** (UI基本): T4-1, T4-2, T4-3, T4-4 - **UI部品**
5. **Phase 5** (カレンダー): T5-1, T5-2, T5-3, T5-4 - **ホームUI**
6. **Phase 6** (シフト管理): T6-1, T6-2, T6-3, T6-4 - **主要機能**
7. **Phase 7** (ビジネスロジック): T7-1, T7-2, T7-3, T7-4 - **計算エンジン**
8. **Phase 8** (給与集計): T8-1, T8-2, T8-3 - **レポート**
9. **Phase 9** (設定管理): T9-1, T9-2, T9-3 - **管理画面**
10. **Phase 10** (Google Calendar): T10-1, T10-2, T10-3 - **外部連携**
11. **Phase 11** (一括登録): T11-1, T11-2, T11-3 - **高度な機能**
12. **Phase 12** (統合): T12-1, T12-2, T12-3, T12-4 - **完成化**

---

## 5. Codeexレビューガイドライン

各タスク完了時に確認すべき項目：

### **コード品質**

- [ ] TypeScript strict モード エラーなし
- [ ] ESLint ルール違反なし
- [ ] Prettier フォーマット適用済み
- [ ] 不要なコメント・デバッグコード削除

### **テスト**

- [ ] 該当フェーズのユニット/統合テスト成功
- [ ] エッジケーステスト追加
- [ ] テストカバレッジ記載

### **ドキュメント**

- [ ] 実装の意図をコード内コメントで説明（複雑な場合）
- [ ] API のパラメータ・レスポンス説明

### **パフォーマンス**

- [ ] N+1クエリない（Phase 3 以降）
- [ ] 画面遷移ラグなし

### **セキュリティ**

- [ ] 認可チェック（ユーザー隔離）
- [ ] 入力バリデーション

### **ユーザー体験**

- [ ] エラーメッセージが日本語・明確
- [ ] ローディング表示
- [ ] 成功メッセージ表示

---

## 6. IMPLEMENTATION_TASKS.md の利用方法

**Codeexへの依頼テンプレート**

```
以下のタスク T6-1 を実装してください。

**タスク**: T6-1: SCR_004 シフト入力フォーム実装

**概要**: 新規シフト登録フォーム。NORMAL・LESSON型の分岐、時刻入力またはコマ選択。

[タスク詳細をコピーして貼り付け]

**実装環境:**
- 参照ドキュメント： DESIGN_SPECIFICATION.md
- コードスタイル: AGENTS.md 参照
- フレームワーク: Next.js App Router, React 19, TypeScript strict

**完了条件**:
- ...

**提出物**:
1. 実装コード (pullrequest)
2. テスト結果
3. スクリーンショット（UI変更の場合）
```

---

**最後に**

此リスト は DESIGN_SPECIFICATION.md の各セクションを元に、実装可能な単位に細分化したものです。
各タスクは、独立してレビュー・マージ可能な粒度に設計されています。
