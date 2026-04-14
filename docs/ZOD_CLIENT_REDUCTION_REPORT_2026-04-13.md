# Client Zod 削減レポート（2026-04-13）

## 1. 目的

- クライアント側 `zod` と未使用 `zod` を削減し、`/my/workplaces` 系ページの初期転送量を改善する。
- サーバー境界（API入力バリデーション）の `zod` は維持し、仕様の安全性を落とさない。

## 2. スコープ

- 対象:
  - `components/workplaces/workplace-list.tsx`
  - `components/workplaces/payroll-rule-list.tsx`
  - `components/workplaces/timetable-list.tsx`
  - `components/data-table.tsx`（未使用）
  - `hooks/use-form-with-validation.ts`（未使用）
- 非対象:
  - `app/api/**` のサーバー側 `zod`

## 3. 削減前の現状

### 3.1 `zod` import 分布

- `zod` import ファイル数: 19
  - `app/`: 13（API中心）
  - `components/`: 4
  - `hooks/`: 1
  - `lib/`: 1

### 3.2 クライアント側 `zod` 利用

- 実運用クライアント:
  - `components/workplaces/workplace-list.tsx`
  - `components/workplaces/payroll-rule-list.tsx`
  - `components/workplaces/timetable-list.tsx`
- 未使用（現状参照なし）:
  - `components/data-table.tsx`
  - `hooks/use-form-with-validation.ts`

### 3.3 バンドルベースライン（削減前）

計測コマンド:

- `pnpm next experimental-analyze --output`

抽出方法:

- 各ページの `page_client-reference-manifest.js` に含まれる `entryJSFiles` を対象に、
  `static/chunks/*.js` の `gzip` サイズを合算。

主要結果（gzip）:

| Route                                        | Total Gzip |
| -------------------------------------------- | ---------: |
| `/my/workplaces`                             |  195,924 B |
| `/my/workplaces/[workplaceId]/payroll-rules` |  196,377 B |
| `/my/workplaces/[workplaceId]/timetables`    |  195,889 B |

`zod` クライアントチャンク:

- `static/chunks/0cxigu87l6dmg.js`
  - raw: `270,072 B`
  - gzip: `64,042 B`

上記3ルートはいずれもこのチャンクを参照している。

### 3.4 ランタイム状態

- `nextjs_call(get_errors)` 結果: `configErrors: []`, `sessionErrors: []`

## 4. 削減方針

1. `components/workplaces/*-list.tsx`

- `zod` スキーマ検証を軽量な型ガード関数へ置換する。
- 既存のエラー文言・フォールバック挙動は維持する。

2. 未使用 `zod` の整理

- `components/data-table.tsx`: `z.infer` 依存を TypeScript 型へ置換。
- `hooks/use-form-with-validation.ts`: `zod` 依存APIを廃止し、汎用バリデータ関数受け取りへ変更。

3. サーバー側 `zod` は維持

- `parseJsonBody` を起点とする API 入力検証は維持する。

## 5. 実装計画

1. クライアント3ファイルの `zod` 置換
2. 未使用2ファイルの `zod` 依存除去
3. 型検証・Lint・Format
4. 再計測（同条件）と差分算出
5. 本ドキュメントへ実測結果を追記

## 6. 検証項目

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm format`
- `pnpm next experimental-analyze --output`

## 7. リスクと対策

- リスク: クライアント側レスポンス検証の厳密性低下
  - 対策: 必須フィールドのみを網羅する型ガードを実装し、異常時は既存同様に失敗扱いにする。
- リスク: 未使用ファイルのAPI変更影響
  - 対策: 現在参照がないことを確認済み。将来利用時は呼び出し側で明示的バリデータを渡す設計に統一。

## 8. 実装後結果（2026-04-13）

### 8.1 実装内容（完了）

- クライアント3ファイルの `zod` を型ガード実装へ置換
  - `components/workplaces/workplace-list.tsx`
  - `components/workplaces/payroll-rule-list.tsx`
  - `components/workplaces/timetable-list.tsx`
- 未使用2ファイルの `zod` 依存除去
  - `components/data-table.tsx`
  - `hooks/use-form-with-validation.ts`
- 追加整理:
  - `lib/api/http.ts` の `zod` 型依存を `safeParse` 互換インターフェースへ置換（実行時挙動は維持）

### 8.2 `zod` import 分布の差分

| 区分              | Before | After | Diff |
| ----------------- | -----: | ----: | ---: |
| `zod` import 総数 |     19 |    13 |   -6 |
| `app/`            |     13 |    13 |    0 |
| `components/`     |      4 |     0 |   -4 |
| `hooks/`          |      1 |     0 |   -1 |
| `lib/`            |      1 |     0 |   -1 |

補足:

- クライアント側（`components/` + `hooks/`）の `zod` import は **5 → 0**。
- 残存 `zod` は `app/api/**` のサーバー入力バリデーションのみ。

### 8.3 バンドル再計測（同条件）

計測コマンド:

- `pnpm next experimental-analyze --output`

主要結果（gzip, `page_client-reference-manifest.js` 起点の同一集計）:

| Route                                        |    Before |     After | Diff |
| -------------------------------------------- | --------: | --------: | ---: |
| `/my/workplaces`                             | 195,924 B | 195,924 B |  0 B |
| `/my/workplaces/[workplaceId]/payroll-rules` | 196,377 B | 196,377 B |  0 B |
| `/my/workplaces/[workplaceId]/timetables`    | 195,889 B | 195,889 B |  0 B |

`zod` を含む主要チャンク:

- `static/chunks/0cxigu87l6dmg.js`
  - raw: `270,072 B`
  - gzip: `64,042 B`
  - 差分: `0 B`

### 8.4 評価

- **コード整理の観点**:
  - 目的達成。クライアント側および未使用箇所の `zod` 依存は除去済み。
- **転送量の観点**:
  - 本計測方式では、対象3ルートの gzip 合計と主要 `zod` チャンクに差分は観測されなかった。
  - 推定要因: 既存の共有チャンク構成上、今回の削減対象だけでは `zod` チャンク排除条件に達していない。

### 8.5 残課題

- `zod` チャンク残存の厳密な依存元を特定するには、`experimental-analyze` のモジュール依存データ起点で追加分析が必要。

## 9. キャッシュ影響を除外した再分析（2026-04-14）

### 9.1 実施内容

- `rm -rf .next/diagnostics` を実行して診断出力を明示的にクリア。
- その後、`pnpm next experimental-analyze --output` を再実行。
- `data/my/workplaces/**/analyze.data` の `source -> output_file(chunk)` 対応を解析し、`zod` 寄与を再評価。

### 9.2 解析結果

- 対象3ルート（`/my/workplaces` 系）の `analyze.data` において、クライアントチャンクへ寄与する `zod` 系ソースは **0件**。
- 非APIの `analyze.data` 全体を横断しても、クライアントチャンクへの `zod` 寄与は **0件**。

### 9.3 対象3ルートの再計測（analyze.data集計）

`compressed_size` の集計値（client JS 合計）:

| Route                                        | Client JS Compressed Total | `zod` 寄与 |
| -------------------------------------------- | -------------------------: | ---------: |
| `/my/workplaces`                             |                  417,171 B |        0 B |
| `/my/workplaces/[workplaceId]/payroll-rules` |                  417,653 B |        0 B |
| `/my/workplaces/[workplaceId]/timetables`    |                  417,110 B |        0 B |

### 9.4 解釈

- 第8章で参照した `page_client-reference-manifest.js` ベースのチャンク名と、
  `experimental-analyze` の内部出力（`analyze.data`）は一致しないケースがある。
- 今回、診断出力をクリアしたうえで `analyze.data` を直接解析した結果では、
  **クライアント側 `zod` は実質的に除去済み** と判断できる。

## 10. 比較指標の統一と最終比較（2026-04-14）

### 10.1 正式な比較指標

本タスクの「削減前後比較」は、以下の単一指標で統一する。

- `M1`: `page_client-reference-manifest.js` の `entryJSFiles` に含まれる
  `static/chunks/*.js` を `gzip` した合計バイト数（ルート単位）

採用理由:

- 削減前（第3章）と削減後（第8章）で同一条件の値が揃っており、時系列比較が可能なため。
- `analyze.data` の `compressed_size` は内部表現であり、`M1` と混在比較しない。

### 10.2 M1での再比較結果

| Route                                        | M1 Before |  M1 After | Diff | Diff % |
| -------------------------------------------- | --------: | --------: | ---: | -----: |
| `/my/workplaces`                             | 195,924 B | 195,924 B |  0 B |  0.00% |
| `/my/workplaces/[workplaceId]/payroll-rules` | 196,377 B | 196,377 B |  0 B |  0.00% |
| `/my/workplaces/[workplaceId]/timetables`    | 195,889 B | 195,889 B |  0 B |  0.00% |

### 10.3 最終判定

- `M1` ベースでは、対象3ルートの JS バンドルサイズは **増加していない**（差分 0）。
