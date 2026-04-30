# react-hooks/set-state-in-effect 対応計画 (2026-04-30)

## 1. 目的

依存更新により `react-hooks/set-state-in-effect` が error 化したため、

- どこを直すべきか（必要性）
- どこから直すべきか（費用対効果とリスク）
  を明確化し、将来実装できる状態にする。

本計画は「段階移行」と「移行しない運用」の両方を定義する。

## 2. 現状サマリ

- 強制有効化時の結果: **26 errors / 14 files**
- 大半は「effect 内で props/state を同期するための `setState`」
- 典型パターン:
  - 初期値同期
  - URL/props 変更時の state 同期
  - 依存 state の正規化（勤務先変更時にフォーム値を補正）

## 3. 優先度判定基準

### 3.1 必要性スコア（高いほど先に対応）

- 影響範囲: 呼び出し箇所・共通フックか
- 体感性能影響: 再レンダー連鎖・データ量依存
- 不具合リスク: 入力値上書き、同期ずれの起こりやすさ

### 3.2 コスト（リスク）スコア（高いほど後回し）

- ロジック複雑度
- 画面仕様への影響
- テスト追加量

## 4. 対象一覧と優先順位

| Priority | 対象                                             | 必要性 | コスト/リスク | 判断                   |
| -------- | ------------------------------------------------ | ------ | ------------- | ---------------------- |
| A1       | `hooks/use-month-shifts.ts`                      | 高     | 中            | 先行対応（共通基盤）   |
| A1       | `components/dashboard/dashboard-page-client.tsx` | 高     | 中            | 先行対応（高頻度画面） |
| A2       | `components/shifts/shift-list-page-client.tsx`   | 中〜高 | 低〜中        | 早期対応（比較的安全） |
| A2       | `components/summary/summary-page-client.tsx`     | 中     | 中            | 早期対応               |
| B1       | `components/shifts/ShiftForm.tsx`                | 高     | 高            | 設計を分けて段階対応   |
| B1       | `components/shifts/BulkShiftForm.tsx`            | 高     | 高            | 設計を分けて段階対応   |
| B2       | `components/shifts/ConfirmShiftCard.tsx`         | 中     | 低            | `key`/初期化で即対応可 |
| B2       | `components/chart-area-interactive.tsx`          | 低     | 低            | 即対応可               |
| C1       | `components/workplaces/*-list.tsx`               | 低〜中 | 低            | 後回し可               |
| C1       | `components/workplaces/*-form.tsx`               | 低〜中 | 低〜中        | 後回し可               |
| C1       | `hooks/use-mobile.ts`                            | 低     | 低            | 後回し可               |

## 5. 実装方針

### 5.1 共通ルール

- `effect` は「外部同期（fetch/subscription/DOM）」用途に限定する。
- 「値を合わせるためだけ」の `setState` は避ける。
- 必要時は次の順で採用:
  1. render時の派生値化
  2. `useState` 初期化関数
  3. `key` による再マウント
  4. `useReducer` でイベント駆動更新

### 5.2 移行パターン

1. 初期値同期型

- 例: `if (hasInitialData) setIsLoading(false)`
- 対応: `useState(() => !hasInitialData)` + fetch effect だけ残す

2. props変更追従型

- 例: `shift` 変更時に入力値再同期
- 対応: 親から `key={shift.id}` を渡して再マウント、または局所 reducer リセット

3. 依存state正規化型（高リスク）

- 例: 勤務先種別変更で `shiftType/timetable` を補正
- 対応: effectで補正せず、変更イベント内で1回の state 更新に統合

## 6. 段階移行ロードマップ（推奨）

### Phase 0: 計測とガード

- `eslint` 本体は現状 `off` 維持
- CIで `--rule 'react-hooks/set-state-in-effect:warn'` を別ジョブ実行し、件数増加を検知

### Phase 1: 低リスク・高効果

対象:

- `hooks/use-month-shifts.ts`
- `components/dashboard/dashboard-page-client.tsx`
- `components/shifts/shift-list-page-client.tsx`
- `components/summary/summary-page-client.tsx`

完了条件:

- 対象ファイルで同ルール違反ゼロ
- `pnpm exec tsc --noEmit` / `pnpm lint` 通過
- 主要画面の手動確認（`/my`, `/my/shifts/list`, `/my/summary`）

### Phase 2: 低リスク回収

対象:

- `ConfirmShiftCard`
- `chart-area-interactive`
- `workplaces/*-list`, `use-mobile`

狙い:

- 件数を短期間で削減し、残件を高難易度箇所へ集中

### Phase 3: 高難易度（設計変更）

対象:

- `ShiftForm`
- `BulkShiftForm`

実装単位:

- 3-1: 勤務先変更ハンドラ内に正規化を寄せる
- 3-2: シフト種別変更ハンドラ内に lesson/NORMAL 変換を寄せる
- 3-3: 必要に応じ `useReducer` 化

検証強化:

- 既存のシフト系テストにケース追加
- 入力中データが意図せず消えないことを確認

### Phase 4: ルール再有効化

- まず `warn` で repo 全体ゼロ化
- その後 `error` に戻す
- 1〜2スプリント監視して問題なければ固定

## 7. 移行しない場合の運用（代替案）

### 7.1 採用条件

- フォーム改修の優先度が低い
- 既存挙動リスクを最小化したい

### 7.2 実施内容

- `react-hooks/set-state-in-effect` は `off` を維持
- ただし以下を必須化:
  - CIで `warn` 監視
  - 新規コンポーネントでは同パターン禁止（レビュー基準）
  - 四半期ごとに再評価

### 7.3 リスク

- 既存の再レンダー連鎖は残る
- 将来の依存更新で再度コストが発生しやすい

## 8. 推奨結論

- **短期は代替案（off + warn監視）で安定運用**
- **中期で Phase 1→2→3 の順に段階移行**

理由:

- 必要性が高い箇所は存在するが、全件同時改修はリスクが高い。
- 先に共通基盤と高頻度画面を直す方が、体感改善と安全性のバランスがよい。

## 9. 実装時チェックリスト

- 変更前後で `pnpm exec tsc --noEmit` 通過
- `pnpm lint` 通過
- `pnpm format` 実行
- 画面確認:
  - `/my`
  - `/my/summary`
  - `/my/shifts/list`
  - `/my/shifts/new`
  - `/my/shifts/bulk`
