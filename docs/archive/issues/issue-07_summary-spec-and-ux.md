# [issues-7] 給与サマリーにおける仕様変更と表示改善

## 概要

以下のそれぞれをコミットを分けて実装する。

- 現状では「前月合計」は前月の同時期の合計値を表示しているが、「月選択」のときには同時期ではなく前月全体の合計額を表示するように変更
- 給与に関連するグラフの縦軸を「10k」のような表示ではなく「10,000」のような表示に変更
- fix: 勤務先別内訳の「勤務時間」算出を仕様どおりに修正する。
  - 現状は `LESSON` 型シフトが `workHours = 0` として扱われるため、勤務先別内訳と総勤務時間が過少集計になる。
  - `LESSON` 型シフトでも `H_total = (endTime - startTime - breakMinutes) / 60` を算出し、`totalWorkHours` と `byWorkplace[*].workHours` に加算する。
  - calculateLessonShiftWage の return value を適切に実装する。
  - 既存テスト（`summarizeByPeriod` / `calculateLessonShiftWage`）の期待値を新仕様に合わせて更新する。
