# シフト管理アプリ

## 設計書（初版）

---

# 1. システム概要

本システムは  
**個人用シフト・給与概算管理Webアプリ**である。

主な機能

- シフト登録
- カレンダー表示
- 概算給与計算
- Google Calendar同期

---

# 2. システム構成

Browser  
↓  
Next.js App Router  
↓  
Prisma ORM  
↓  
PostgreSQL互換DB  
↓  
Google Calendar API

---

# 3. ドメインモデル

---

# User

ログインユーザー

| 属性      | 型       |
| --------- | -------- |
| id        | UUID     |
| email     | string   |
| createdAt | datetime |

---

# Workplace

勤務先

| 属性      | 型       |
| --------- | -------- |
| id        | UUID     |
| name      | string   |
| color     | string   |
| type      | enum     |
| createdAt | datetime |

type

- GENERAL
- CRAM_SCHOOL

---

# PayrollRule

給与ルール履歴

| 属性                   | 型      |
| ---------------------- | ------- |
| id                     | UUID    |
| workplaceId            | UUID    |
| startDate              | date    |
| endDate                | date?   |
| baseHourlyWage         | number  |
| holidayHourlyWage      | number? |
| nightMultiplier        | number  |
| dailyOvertimeThreshold | number  |
| overtimeMultiplier     | number  |
| nightStart             | time    |
| nightEnd               | time    |
| holidayType            | enum    |

holidayType

- NONE
- WEEKEND
- HOLIDAY
- WEEKEND_HOLIDAY

---

# Timetable

塾の時間割

| 属性        | 型   |
| ----------- | ---- |
| id          | UUID |
| workplaceId | UUID |
| type        | enum |
| period      | int  |
| startTime   | time |
| endTime     | time |

type

- NORMAL
- INTENSIVE

---

# Shift

シフト

| 属性          | 型       |
| ------------- | -------- |
| id            | UUID     |
| workplaceId   | UUID     |
| date          | date     |
| startTime     | time     |
| endTime       | time     |
| breakMinutes  | int      |
| shiftType     | enum     |
| googleEventId | string   |
| createdAt     | datetime |

shiftType

- NORMAL
- LESSON
- OTHER

---

# ShiftLessonRange

塾のコマ範囲

| 属性        | 型   |
| ----------- | ---- |
| id          | UUID |
| shiftId     | UUID |
| startPeriod | int  |
| endPeriod   | int  |

---

# 4. 主要ユースケース

---

## シフト登録

1. カレンダー日付をクリック
2. シフト入力
3. DB保存
4. Google Calendar同期

---

## シフト編集

1. シフト選択
2. 編集
3. DB更新
4. Google Calendar更新

---

## シフト削除

1. シフト削除
2. DB削除
3. Google Calendar削除

---

# 5. カレンダーUI

月カレンダーを採用

表示

- シフトあり → 色付き丸

クリック

- 日別シフト一覧表示

---

# 6. 集計機能

主集計

給与締め期間ベース

表示

- 総勤務時間
- 概算給与
- 勤務先別内訳

副表示

- 月合計
- 年合計

---

# 7. Google Calendar同期

ルール

| 操作 | 処理         |
| ---- | ------------ |
| 作成 | イベント作成 |
| 編集 | イベント更新 |
| 削除 | イベント削除 |

Google Calendar側の編集は  
アプリに反映しない。

---

# 8. 給与計算仕様

対象

- 基本時給
- 休日時給
- 深夜割増
- 1日所定時間外

非対象

- 控除
- 週残業
- 月60時間残業

---

# 9. 今後の拡張可能性

将来的に以下を追加可能

- PWA
- CSV出力
- 複数ユーザー
- 交通費
- 厳密な労基法残業計算
