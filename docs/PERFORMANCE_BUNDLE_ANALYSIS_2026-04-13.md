# Bundle Analysis Log (2026-04-13)

## 1. 目的

`docs/PERFORMANCE_INVESTIGATION_2026-04-13.md` の改善実装前後で、`next experimental-analyze` の圧縮後クライアント JS サイズを比較する。

## 2. 計測方法

- コマンド: `pnpm next experimental-analyze --output`
- 出力: `.next/diagnostics/analyze`
- 集計対象: 各ルートの `/_next/static/chunks/*.js` の `compressed_size` 合計
- 補足: 集計は `analyze.data` の JSON 部分（先頭4byte以降のメタデータ）から抽出

## 3. 実装前ベースライン（2026-04-13）

| Route             | Compressed Client JS |
| ----------------- | -------------------: |
| `/login`          |            259.0 KiB |
| `/my`             |            401.6 KiB |
| `/my/shifts/list` |            415.1 KiB |
| `/my/shifts/new`  |            439.0 KiB |
| `/my/workplaces`  |            499.2 KiB |
| `/my/summary`     |            569.7 KiB |

## 4. 実装後

### 4.1 再計測条件（2026-04-13）

- コマンド: `pnpm next experimental-analyze --output`
- 集計対象: 実装前と同一（`/_next/static/chunks/*.js` の `compressed_size` 合計）

### 4.2 実装後の計測値と差分

| Route             |    Before |     After |     Diff |
| ----------------- | --------: | --------: | -------: |
| `/login`          | 259.0 KiB | 258.2 KiB | -0.8 KiB |
| `/my`             | 401.6 KiB | 400.3 KiB | -1.4 KiB |
| `/my/shifts/list` | 415.1 KiB | 413.6 KiB | -1.5 KiB |
| `/my/shifts/new`  | 439.0 KiB | 437.4 KiB | -1.6 KiB |
| `/my/workplaces`  | 499.2 KiB | 497.7 KiB | -1.5 KiB |
| `/my/summary`     | 569.7 KiB | 577.8 KiB | +8.1 KiB |

### 4.3 判定

- `/my` 系の複数ルートで小幅に減少。
- 一方で `/my/summary` は増加しており、合計値ベースでは部分的に未改善。

### 4.4 `/my/summary` 未改善（増加）の考察と追加改善案

考察（今回の計測方式に基づく）:

- `next/dynamic` による分割で `recharts` 本体は遅延読込化できたが、今回の集計は「ルートに紐づく全チャンク合計」を見るため、遅延チャンク自体も合計に含まれる。
- その結果、初期表示の体感改善余地はあっても、ルート合計サイズ指標では増加して見える。

追加改善案:

1. `/my/summary` は「初期表示チャンク」と「遅延チャンク」を分離して別指標で追跡する（初期表示の転送量を主指標化）。※本書 4.5 に反映済み。
2. チャート描画対象データをさらに絞り、`recharts` 利用箇所を最小化する。
3. 必要であれば、より軽量な可視化手段（CSSベース簡易グラフや軽量ライブラリ）へ置換して再計測する。

### 4.5 `/my/summary` 初期表示チャンクと遅延チャンクの分離指標

分類ルール:

- 初期表示チャンク: `/my/summary` のクライアントJS合計から、遅延チャンクを除いた値
- 遅延チャンク: `components/summary/workplace-wage-chart.tsx`（`next/dynamic` の動的import起点）を含むクライアントチャンク

結果（圧縮後）:

| 指標                   |    Before |     After |       Diff |
| ---------------------- | --------: | --------: | ---------: |
| `/my/summary` 総量     | 569.7 KiB | 577.8 KiB |   +8.1 KiB |
| `/my/summary` 初期表示 | 569.7 KiB | 416.1 KiB | -153.6 KiB |
| `/my/summary` 遅延読込 |   0.0 KiB | 161.7 KiB | +161.7 KiB |

備考:

- Before の初期/遅延分離値は、実装前コードでチャートを動的importしていない（`recharts` を直接import）ことに基づく。
- この分離指標により、`/my/summary` は「総量は増加したが、初期表示転送量は大幅削減」と評価できる。
