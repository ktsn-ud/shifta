# 実給与登録と実績優先表示 実装計画

## 概要

- `勤務先 × 支給月` 単位で実給与を登録する。
- 実給与は `課税対象額` と `非課税対象額` に分けて保持する。
- `給与サマリー` と `給与詳細` は、実給与がある箇所では実績値を優先表示する。
- 年合計と累計は、各月の `実績支給額` を積み上げて算出する。

## 実装順

1. Prisma schema に `ActualPayroll` を追加する。
2. 実給与取得と表示優先判定の共通ロジックを `lib/payroll` に追加する。
3. `GET/PUT /api/payroll/actual` を追加する。
4. `/my/payroll/actual` の月次一括編集 UI を追加する。
5. `summary` / `details` API に表示優先値を追加する。
6. `給与サマリー` と `給与詳細` UI を実績優先表示へ更新する。
7. 設計書とこの計画書を更新する。

## API / UI 契約

- `GET /api/payroll/actual?month=YYYY-MM`
  - 各勤務先について `estimatedAmount`, `taxableAmount`, `nonTaxableAmount`, `displayAmount`, `differenceAmount` を返す。
- `PUT /api/payroll/actual?month=YYYY-MM`
  - 月内の複数勤務先入力を一括保存する。
  - `課税対象額` と `非課税対象額` が両方未入力で、メモも空なら削除扱いとする。
- `summary`
  - `totalWage`, `currentMonthCumulative`, `yearlyTotal` は実績優先表示値を返す。
  - 比較用に `estimated*` を返す。
- `details`
  - 時間内訳と計算式は概算由来のまま維持する。
  - 金額主表示のみ `displayValue` を使う。

## テスト観点

- 実給与未登録時は従来どおり概算が表示される。
- 一部勤務先だけ実給与登録済みでも、未登録勤務先は概算のまま表示される。
- `給与サマリー` の累計/年計が、実績登録済み月で実績優先になる。
- `給与詳細（勤務先毎）` の年合計が、月ごとの `実績支給額` の合計になる。
- `PUT /api/payroll/actual` で upsert と削除が期待どおり動く。

## コミット分割案

1. `docs: 実給与登録仕様と計画書を追加`
2. `feat: ActualPayroll モデルとAPI基盤を追加`
3. `feat: 実給与編集画面を追加`
4. `feat: 給与サマリーと給与詳細を実績優先表示へ更新`
