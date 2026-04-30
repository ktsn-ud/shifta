# 給与計算仕様書 V2

## 時間区分

以下の3つに分類する。

- **基本時間**
  - 総労働時間から深夜時間を除いた労働時間とする。平日/休日の違いは無視する。
  - 基本時間 = 総労働時間 - 深夜時間
- **深夜時間**
  - 深夜時間22:00-翌5:00に勤務した時間
- **休日時間**
  - 勤務先ごとに定義された休日に勤務した時間とする。
  - 基本時間・深夜時間とは独立

## 支給額計算

### 分類

以下の3つに分類する。

- **基本支給**
  - 基本支給 = 基本給 \* 基本時間
- **深夜支給**
  - 深夜支給 = 基本給 _ (1 + 深夜割増率) _ 深夜時間
  - 注意: 従来の深夜割増率とは意味が異なるが、ユーザーがアプリ操作で修正するので、気にせずこの式を適用すること。
- **休日支給**
  - 休日支給 = 休日手当（時間あたり） \* 休日時間
  - 注意: 従来の「休日給」は廃止し、代わりに時間あたり休日手当に休日時間を乗ずることで計算する。時給そのものを変更するのではなく、独立した加算手当として扱う。

これらの和が総支給額である。

### 丸め処理

上で述べた3つの各支給項目ごとに、1円未満を四捨五入する。

## データベースの扱いとそれに付随する変更について

以下、`PayrollRule` モデルについて。

- `baseHourlyWage`: 基本給
- `holidayHourlyWage`: 廃止
  - 代わりに休日手当（加算手当）を表すカラムを新規に作成。これのデフォルト値は 0 でよい。
- `nightMultiplier`: 深夜割増率
  - `nightPremiumRate` などの名称へ変更する。
  - 最小値は 0 とする。
  - 基本給に乗ずるときは `(1 + 割増率)` とする必要があることに注意。
- `overtimeMultiplier`: 所定時間外割増率
  - `overtimePremiumRate` などの名称へ変更する。
  - 最小値は 0 とする。
  - 将来実装に備えて保持するが、現時点のV2計算では扱いを保留する。
- `nightStart` / `nightEnd`: 廃止。
  - 22時〜翌5時で決め打ち
- `dailyOvertimeThreshold`: 変更無し

以上の変更に合わせて各種変数名や計算ロジックを見直す必要がある。

---

## 現状コード確認結果（2026-04-30）

本仕様に対して、現行実装は旧仕様（休日時給差し替え + 割増率が倍率前提）で動いている。主な差分は以下。

### 1. DB / Prisma

- `prisma/schema.prisma` の `PayrollRule` は以下の旧カラム構成。
  - `holidayHourlyWage` が存在（休日時給の差し替え用途）
  - `nightStart` / `nightEnd` が存在（可変深夜帯）
  - `nightMultiplier` / `overtimeMultiplier` は倍率前提の命名・値域
- 新仕様で必要な「休日手当（時間あたり加算）」カラムは未実装。

### 2. 計算ロジック

- `lib/payroll/calculateShiftWage.ts`
  - 現在は `dayWage = 総労働時間 × 適用時給`（深夜時間を基本時間から除外していない）
  - `holidayHourlyWage` を「休日時の時給差し替え」として使用
  - 深夜支給は `nightHours × hourlyWage × (nightMultiplier - 1)`（旧仕様）
  - 残業支給を別建て加算（`overtimeWage`）
- `lib/payroll/timeClassification.ts`
  - 深夜帯を `nightStart` / `nightEnd` から計算（固定22:00-05:00ではない）

### 3. API / バリデーション

- 対象:
  - `app/api/workplaces/route.ts`
  - `app/api/workplaces/[workplaceId]/payroll-rules/route.ts`
  - `app/api/workplaces/[workplaceId]/payroll-rules/[id]/route.ts`
- いずれも `holidayHourlyWage`, `nightStart`, `nightEnd` を受け取り必須運用している。
- `nightMultiplier` / `overtimeMultiplier` は `min(1)` で検証しており、新仕様の割増率（0.25など）と不整合。

### 4. UI（給与ルール入力・一覧）

- `components/workplaces/payroll-rule-form.tsx`
- `components/workplaces/workplace-form.tsx`（勤務先作成時の初期給与ルール）
- `components/workplaces/payroll-rule-list.tsx`
- いずれも旧項目（休日時給、深夜開始/終了時刻、倍率表示）に依存。

### 5. 集計・表示・連携

- `lib/payroll/summary.ts`, `lib/payroll/details.ts`, `components/payroll-details/*`
  - 旧内訳（基本/休日/深夜/残業）と旧計算根拠表示に依存。
- `lib/google-calendar/syncEvent.ts`
  - イベント説明の給与見積もりが旧計算ロジック依存。

### 6. テスト

- `lib/payroll/__tests__/*` と関連表示テストは、旧式（休日時給差し替え、深夜倍率=1.25前提）の期待値で作成されている。

## 必要変更の洗い出し

### A. モデル変更（必須）

1. `PayrollRule` から `holidayHourlyWage`, `nightStart`, `nightEnd` を廃止。
2. `holidayAllowanceHourly`（名称は仮）を追加。`DEFAULT 0`。
3. `nightMultiplier` / `overtimeMultiplier` は仕様意図に合わせて名称見直し（例: `nightPremiumRate`, `overtimePremiumRate`）。
4. 新旧データ移行方針を定義（既存値の変換ルールを明文化）。

### B. 計算ロジック変更（必須）

1. 時間区分を仕様通りに再定義。
   - 基本時間 = 総労働時間 - 深夜時間
   - 深夜時間 = 固定22:00-05:00
   - 休日時間 = 休日判定に合致した勤務時間
2. 支給額を3区分で再実装。
   - 基本支給 = 基本給 × 基本時間
   - 深夜支給 = 基本給 × (1 + 深夜割増率) × 深夜時間
   - 休日支給 = 休日手当(円/時) × 休日時間
3. 各支給項目ごとに四捨五入してから合算。
4. `calculateShiftWage` の戻り型と集計側（summary/details）の項目構造を新仕様に合わせる。

### C. API / UI変更（必須）

1. 給与ルール作成・更新APIの入出力項目を新仕様へ変更。
2. バリデーションを新値域へ変更（割増率は 0 以上前提）。
3. 給与ルールフォーム/一覧を新項目表示へ変更。
4. 「深夜開始/終了時刻」入力UIを削除（固定値の説明文へ置換）。
5. 勤務先作成時の初期給与ルール入力も同様に更新。

### D. 集計/詳細表示・外部連携（必須）

1. 給与詳細の計算根拠表示（式・ラベル）を新3区分へ統一。
2. 月次集計/勤務先別集計で、旧残業表示の扱いを仕様に合わせて整理。
3. Google Calendar 同期メッセージの見積給与を新ロジックで再計算。

### E. テスト更新（必須）

1. 単体テスト（`calculateShiftWage`, `timeClassification`, `summary`, `details`）の期待値更新。
2. API/フォームバリデーションのテスト観点を新項目へ置換。
3. 休日・深夜重複ケース（休日夜勤）の回帰ケースを追加。

## 合意済み事項（2026-04-30）

1. **残業割増の扱い**  
   `overtimePremiumRate`（旧 `overtimeMultiplier`）は将来実装のため保持する。  
   ただし現時点のV2給与計算では保留とし、計算式には含めない。

2. **休日手当カラムの初期値/移行方針**  
   旧 `holidayHourlyWage` は廃止し、新しい休日手当カラム（例: `holidayAllowanceHourly`）へ移行する。  
   既存データ移行時は一律 `0` を設定し、必要に応じてユーザーが手動更新する。

3. **割増率カラムの名称と値域**  
   `nightMultiplier` / `overtimeMultiplier` は `*PremiumRate` 系に改名する。  
   割増率の最小値は `0` とする。

4. **深夜時間帯の定義**  
   深夜時間帯は `22:00-05:00` で固定とし、勤務先ごとの可変設定は行わない。

5. **参照仕様の優先順位**  
   本V2仕様を正本とし、`docs/DESIGN_SPECIFICATION.md` はこの内容に追随して更新する。

6. **Prisma系コマンドの実行体制**  
   実装途中で `prisma migrate` / `prisma generate` が必要になった時点で、実装を一旦停止する。  
   その場で必要コマンドを明示し、ユーザーが実行後に実装を再開する。
