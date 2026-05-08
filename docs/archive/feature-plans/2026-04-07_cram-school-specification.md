# 塾タイプ勤務先に関する新仕様

2026/04/07 策定

## 時間割

現状：「通常」と「講習」の2タイプ。

新：時間割を複数作成可能にし、登録時にユーザーが命名可能とする。シフト登録時には複数の時間割から適当なものを選択し、コマを入力する。仕様変更時の移行は、既に「通常」や「講習」が作成されている場合はそれを時間割名とする。

## 給与体系

コマ給を廃止。他タイプの勤務先同様、時給のみ登録するようにすればよい。計算においては従来通り（要確認）時間割から勤務時間と休憩時間を割り出し、時給×勤務時間で計算する。

### 本仕様で確定した方針（2026/04/07）

1. LESSONにも `休日時給` `深夜割増` `残業割増` を適用する（NORMALと同等ルール）。
2. シフトタイプ `OTHER` は廃止する（`NORMAL` / `LESSON` の2種類へ統一）。
3. 実装着手時は、テスト更新を最初に行う（テスト方針・期待値の先行更新）。

---

## 現状コードベース調査結果（2026/04/07）

### 1) DBスキーマの現状

- `Timetable` は `type: NORMAL | INTENSIVE` の2区分固定で、`(workplaceId, type, period)` 一意。
- 任意名の時間割セットを表すエンティティは存在しない。
- `ShiftLessonRange` は `startPeriod/endPeriod` のみ保持し、どの時間割セットを選んだかは保持していない。
- `PayrollRule` に `perLessonWage`（コマ給）が存在し、CRAM_SCHOOLではAPI/フォームで実質必須。

### 2) シフト登録時の現状挙動

- シフト登録API (`app/api/shifts/_shared.ts`) は `lessonRange.lessonType (NORMAL|INTENSIVE)` + コマ範囲で時間割を引き、`startTime/endTime` とコマ間ギャップから `breakMinutes` を自動算出する。
- 連続コマ欠落時はエラー（「指定コマ範囲の時間割が不足」「連続した時間割が存在しません」）。
- CRAM_SCHOOL の `OTHER` は禁止。LESSON は CRAM_SCHOOL のみ許可。
- 編集時は `lessonType` をDBに持っていないため、時刻逆算で推定してフォーム復元している（同時刻の別セットがあると曖昧）。
- 一括登録 (`app/api/shifts/bulk/route.ts` / `components/shifts/BulkShiftForm.tsx`) も同じ制約で、LESSONは `lessonType + start/end period` 送信。

### 3) 給与計算ロジックの現状（重点）

- LESSON の給与は `コマ数 × perLessonWage`（`lib/payroll/calculateLessonShiftWage.ts`）。
- `startTime/endTime/breakMinutes` は勤務時間表示用には使うが、LESSON賃金計算には使っていない。
- 見積りAPI/一覧の `estimatedPay` も LESSON は `perLessonWage` ベース（`lib/payroll/estimate.ts`）。
- 期間集計 (`lib/payroll/summarizeByPeriod.ts`) は LESSON を別ロジックに分岐し、コマ給計算を採用。

---

## 新仕様対応で必要な変更（洗い出し）

### A. データモデル・マイグレーション

必須変更:

1. 時間割セットを任意名で複数管理できる構造に変更する。
2. 既存 `NORMAL/INTENSIVE` を新構造へ移行する。
3. シフトが「どの時間割セットを使ったか」を保持できるようにする。

推奨構成例:

- `TimetableSet`（`id`, `workplaceId`, `name`, `sortOrder`, `createdAt`...）
- `Timetable` は `timetableSetId` 外部キーで `period/startTime/endTime` を保持
- `ShiftLessonRange`（または `Shift`）に `timetableSetId` を保持

移行要件:

- 既存 `type=NORMAL` 行がある勤務先には名前「通常」のセットを作成し紐付け。
- 既存 `type=INTENSIVE` 行がある勤務先には名前「講習」のセットを作成し紐付け。
- 両方ない勤務先はセット作成不要。

### B. API・バリデーション

必須変更:

1. 時間割APIを `lessonType` 前提から「時間割セットID前提」に変更。
2. シフト作成/更新/一括APIの入力を `lessonType` ではなく `timetableSetId` ベースに変更。
3. `timetableSetId` が勤務先に属するか、コマ範囲が連続して存在するかを検証。
4. 給与ルールAPIから `perLessonWage` 必須制約を除去（最終的には項目自体を廃止）。
5. シフトAPI入力の `shiftType` から `OTHER` を削除し、`NORMAL | LESSON` のみ許可。

### C. UI（時間割管理・シフト登録）

必須変更:

1. 時間割管理画面を「通常期/講習期 固定表示」から「任意名セット一覧 + セット内コマ編集」へ変更。
2. シフト入力/編集画面の `コマ種別(NORMAL/INTENSIVE)` を `時間割選択` に置換。
3. 一括登録画面も同様に `lessonType` を `時間割選択` へ置換。
4. 編集時の `lessonType` 推定ロジックを廃止し、保存済みセットIDで確定復元。
5. シフト入力/編集・一括登録のUIから `OTHER` 選択肢を削除。

### D. 給与計算ロジック（最重要）

必須変更:

1. LESSONの賃金計算を `コマ給` から `時給 × 実勤務時間` へ変更。
2. `estimateShiftPay` / `calculateShiftPayrollResultByRule` / 月次集計のLESSON分岐を時給計算へ統一。
3. `perLessonWage` 依存コードとテストを削除・置換。
4. LESSONにも `休日時給` `深夜割増` `残業割増` を適用する（NORMALと同じ計算パスへ統合）。

影響が大きい既存箇所:

- `lib/payroll/calculateLessonShiftWage.ts`
- `lib/payroll/estimate.ts`
- `lib/payroll/summarizeByPeriod.ts`
- `app/api/shifts/route.ts` の `includeEstimate`
- 給与計算テスト一式（`lib/payroll/__tests__/*`）

確定事項:

1. LESSONの時給計算は、既存NORMALの割増ロジック（休日・深夜・残業）を再利用して統一する。
2. 現状のLESSON金額（コマ給）とは計算方式が変わるため、移行後に月次集計値が変化する前提で扱う。

### E. テスト・ドキュメント

必須変更:

1. ShiftForm/BulkShiftForm のユニットテストを `lessonType` 依存から新時間割セット仕様へ更新。
2. 給与計算テストをコマ給前提から時給前提へ全面更新。
3. `docs/DESIGN_SPECIFICATION.md` の以下を更新:
   - 3.3（PayrollRule: perLessonWage記述）
   - 3.4（Timetable: NORMAL/INTENSIVE固定記述）
   - 8章（LESSON=コマ給計算式）
   - 9.3（シフト入力のコマ種別UI仕様）

---

## 実装順の推奨

1. テスト更新を最初に実施（`OTHER` 廃止、LESSON割増適用、時給統一の期待値を先に固定）。
2. DB拡張（新時間割セット）とデータ移行設計を確定。
3. シフトAPIを新キー（`timetableSetId`）対応し、`shiftType` から `OTHER` を除去。
4. シフトUI（単件・一括）を新入力仕様へ更新（`OTHER` 選択肢削除を含む）。
5. 給与計算ロジックを時給＋割増統一に変更。
6. 給与ルールUI/APIからコマ給を廃止。
7. 回帰確認。

---

## 既存データ移行メモ（今回の前提）

- 単一ユーザー運用のため、必要なら `OTHER` 既存データは `NORMAL` へ寄せる/再登録する運用を許容する。
- ただし、履歴整合性を優先する場合はDB移行時に `OTHER -> NORMAL` の一括変換を実施する。

---

## コミット粒度ガイドライン（本仕様対応）

今回の変更はDB/API/UI/給与計算を横断するため、通常より厳密に「1コミット = 1目的 + 1検証単位」を守る。

### 基本ルール

1. スキーマ変更・アプリ実装・テスト期待値更新を同一コミットに混在させない。
2. 破壊的変更（`OTHER` 廃止、給与計算式変更）は必ず段階コミットに分割する。
3. 各コミットで「何を変えたか」と「何を確認したか」をメッセージ本文に明記する。
4. 後から `revert` しても他機能を巻き込まない単位を維持する。

### 推奨コミット分割

1. テスト先行更新（失敗させる）  
   `OTHER` 廃止、LESSON割増適用、時給計算統一の期待値を先に更新。
2. DBスキーマ追加と移行SQL  
   時間割セット導入、既存 `NORMAL/INTENSIVE` の移行、`OTHER -> NORMAL` 変換（必要時）。
3. API入力/バリデーション変更  
   `timetableSetId` 化、`shiftType` から `OTHER` 削除、関連エラー文言更新。
4. シフトUI変更（単件）  
   `lessonType` UI撤去、時間割選択UI追加、編集復元ロジック更新。
5. シフトUI変更（一括）  
   一括登録側の入力仕様を同様に更新。
6. 給与計算ロジック変更  
   LESSONを時給+割増へ統一、`perLessonWage` 依存撤去。
7. 給与ルールUI/API整理  
   `perLessonWage` 入力と永続化の撤去。
8. ドキュメント最終同期  
   DESIGN_SPECIFICATION/API_REFERENCE等の更新。

### 各コミットで必須の確認

1. 変更対象に対応するテストが通ること（または意図的失敗であること）を明記。
2. `pnpm exec tsc --noEmit` が通ること。
3. `pnpm lint` の結果（新規エラーなし）を確認すること。

### コミットメッセージ例

```text
feat: Txx LESSON給与計算を時給+割増へ統一

- LESSONの賃金計算をコマ給から時給計算へ変更
- 休日時給・深夜割増・残業割増をNORMALと同一ロジックで適用
- perLessonWage依存の計算分岐を削除
- 関連ユニットテストを新仕様期待値へ更新
```

---

## 変更規模の目安

- `INTENSIVE / lessonType / TimetableType` 参照: 100件超
- `perLessonWage / コマ給` 参照: 90件前後

塾仕様周りに広く横断影響があり、特に給与計算は破壊的変更になり得るため、段階的実装と差分検証が必須。
