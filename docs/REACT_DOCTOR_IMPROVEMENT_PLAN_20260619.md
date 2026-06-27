# React Doctor 診断結果と改善計画

作成日: 2026-06-19

## 1. 目的

`react-doctor` の診断結果を整理し、実装順のある改善計画に落とす。

このドキュメントでは **改善はまだ行わない**。実施対象の選定、優先度付け、分割方針のみをまとめる。

## 2. 実施内容

- `react-doctor` をフルスキャンで実行
- `next-devtools` の `init` と `nextjs_index` を実行
- 診断ルールのうち、`error` とセキュリティ関連の主要ルールは公式プロンプトを取得して意図を確認

## 3. スキャン条件と制約

- スキャン日: 2026-06-19
- スコープ: full scan
- React Doctor スコア: `34 / 100` (`Critical`)
- 総件数: `241`
- 内訳: `22 errors`, `219 warnings`
- 影響ファイル数: `79`
- カテゴリ内訳:
  - Bugs: `98`
  - Maintainability: `89`
  - Performance: `40`
  - Accessibility: `10`
  - Security: `4`
- `nextjs_index` では実行中の Next.js dev server を検出できなかったため、この回は静的診断中心
- 許容指摘の永続化先は `.react-doctor/false-positives.md` ではなく、`doctor.config.*` または `package.json#reactDoctor` を前提に整理する必要がある

## 4. ピックアップした指摘

最大20件までに絞る方針に合わせ、実害・件数・構造負債の3軸で優先度を付けた。

### P1: 先に潰すべき項目

1. `app/api/calendar/events/route.ts:529` の `GET` でキャッシュを `prune` / `write` している。
   `writeCalendarEventsCache()` と `pruneCalendarEventsCache()` が GET 内で実行されており、`react-doctor/nextjs-no-side-effect-in-get-handler` の `error`。GET の安全性とキャッシュ責務の整理が必要。

2. `components/shifts/ShiftForm.tsx`, `components/shifts/BulkShiftForm.tsx`, `components/workplaces/timetable-form.tsx`, `components/workplaces/payroll-rule-form.tsx`, `hooks/use-month-shifts.ts` に `react-doctor/query-destructure-result` が `15` 件ある。
   TanStack Query の結果オブジェクトを丸ごと保持しており、不要な購読で再レンダリングが増える。件数も多く、横断的に直す価値が高い。

3. `components/shifts/ShiftForm.tsx:899` で編集対象シフトの内容を `useEffect` でローカル state に同期している。
   `react-doctor/no-adjust-state-on-prop-change` の `error`。フォーム初期化と編集 state が二重化しており、更新漏れや不要な再レンダリングを起こしやすい。

4. `components/shifts/ConfirmShiftCard.tsx:119-126` で `shift` prop 変更のたびに複数 state をリセットしている。
   同じく `no-adjust-state-on-prop-change` の `error`。カード再利用時に state と prop の整合性を effect 頼みにしているため、保守性が低い。

5. `lib/actions/auth.ts:6-11` の exported server action が明示的な認証確認を持たない。
   `react-doctor/server-auth-actions` の `error`。`signOutAction` / `signOutForGoogleTokenExpiredAction` は既存設計上の意図を持つ可能性が高いため、即修正前提ではなく、Phase 0 で既存資料も踏まえて fix / suppression を再判定する対象とする。

6. `pnpm-workspace.yaml` に `minimumReleaseAge` と `trustPolicy` がなく、サプライチェーン hardening が不足している。
   直接の画面不具合ではないが、セキュリティ指摘としては手戻りが少なく、早めに方針決定したい。

### P2: 構造負債が大きい項目

7. `components/shifts/BulkShiftForm.tsx` に `26` 件の診断が集中している。
   巨大コンポーネント化により、Query、localStorage 永続化、Google Calendar 取得、プレビュー生成、既定値補正、送信処理が1ファイルで絡み合っている。`no-giant-component`, `prefer-useReducer`, `no-effect-chain`, `no-derived-state`, `no-fetch-in-effect` が同時に出ているため、個別修正より分割設計が先。

8. `components/shifts/ShiftForm.tsx` に `24` 件の診断が集中している。
   単票フォームも同様に、取得済みデータ・入力 state・給与プレビュー・時間割依存ロジックが密結合している。`error` 解消だけで終えると再発しやすい。

9. `components/shifts/shift-list-page-client.tsx` の月状態と選択状態が effect 鎖で同期されている。
   `no-effect-chain`, `no-derived-state`, `no-render-in-render`, `rendering-hydration-mismatch-time` がまとまって出ている。表示月・URL・選択中シフト集合の責務を分ける必要がある。

10. `components/dashboard/dashboard-page-client.tsx` でも `month` / `displayMonth` を effect で同期している。
    `no-derived-state` と `rendering-hydration-mismatch-time` が同時に出ている。`new Date()` を render 中に使う箇所もあり、SSR/CSR 差分の温床になっている。

11. `components/workplaces/timetable-form.tsx` は `query-destructure-result` に加え、`prefer-useReducer` と `no-array-index-as-key` が出ている。
    時間割行の追加・削除・並び替えを持つフォームなのに state 管理が局所化されておらず、今後の仕様追加に弱い。

12. `components/workplaces/payroll-rule-form.tsx` は Query 結果の購読範囲が広く、派生 state も持っている。
    影響件数は `5` 件だが、給与ルールはアプリの根幹ドメインなので、ここは小さく直して終わらせず整えたい。

### P3: 互換性・性能・保守性の項目

13. Zod 4 非推奨 API が `25` 件、`z.string().email()` / `url()` など top-level string format 未移行が `4` 件ある。
    例: `app/api/users/route.ts:8-13`, `app/api/shifts/_shared.ts:23-57`。すでに `zod@4` を使っているため、将来の更新時に壊れる前に API 面を寄せておくべき。

14. 非同期処理の逐次実行パターンが複数残っている。
    最優先は、`for` / ループ内 `await` で独立処理を逐次実行している箇所で、例として `app/api/shifts/bulk/route.ts:237` がある。`app/api/calendar/events/route.ts` や `lib/google-calendar/syncStatus.ts` には制御付き並列処理も含まれるため、一律な並列化対象として扱わず、「待ち時間がそのまま積み上がるパターン」から先に直すべき。

15. ループ内の探索・ソート・複数走査に関する素直な性能改善が散在している。
    `js-combine-iterations`, `js-set-map-lookups`, `js-cache-property-access`, `js-tosorted-immutable` が複数発生。単体の効果は小さくても、シフト一覧や給与プレビューのような反復処理で効く。

16. `components/chart-area-interactive.tsx` は `recharts` を eager import したまま、かつ `deslop/unused-file` でも報告されている。
    サンプル由来の未使用コンポーネントの可能性が高く、放置コストのわりに依存が重い。

17. `deslop/unused-file` が `14` 件、`deslop/unused-export` が `20` 件ある。
    例: `components/data-table.tsx`, `components/nav-documents.tsx`, `hooks/use-modal.ts`, `lib/payroll/estimate.ts`。不要な公開面と古い試作コードが残っている。

18. アクセシビリティ問題の一部は実利用コンポーネント上にある。
    例: `components/calendar/ShiftListModal.tsx:160` の `role="button"`、`components/shifts/shift-list-page-client.tsx` の同系統パターン、`components/nav-user.tsx:111-118` のログアウト導線。未使用コンポーネント由来の指摘も混ざるが、live path 上の低リスク項目は後回しにせず先に解消できる。

19. `lib/shifts/page-search-params.ts:23` の `returnTo` は URL 由来パラメータとして検出されている。
    現状は `"dashboard" | "list"` の allowlist に丸めており実害は低い。これは即修正候補というより、Phase 0 で「安全な既存実装として suppression 候補か」を再判定する項目。

20. false positive 管理の仕組みがない。
    `server-auth-actions` の sign-out 系や `url-prefilled-privileged-action` のように、設計上許容または既に安全化済みの箇所を区別できない。判断理由を文書へ残すだけでなく、最終的に `doctor.config.*` または `package.json#reactDoctor` に反映しないと、毎回の診断ノイズが高いままになる。

## 5. 改善計画

実装時は「大きい画面から一気に直す」のではなく、`1目的 + 1検証単位` で分割する。

### Phase 0: ベースライン確定

目的: 直すべき指摘と suppression 候補を分離する。

- `server-auth-actions` の2件を既存設計資料と照合し、fix するか suppression 候補として残すかを再判定する
- `url-prefilled-privileged-action` の `returnTo` を、現行 allowlist 実装を踏まえて fix / suppression 候補のどちらかへ再判定する
- 使われていないコンポーネント由来のアクセシビリティ指摘を棚卸しする
- 許容する指摘は判断理由を文書へ残したうえで、`doctor.config.*` または `package.json#reactDoctor` へ反映する

完了条件:

- 今後も追うべき指摘と、意図的に残す指摘の境界が決まっている
- suppression 候補をどこへどう永続化するかが決まっている

### Phase 1: `error` とセキュリティを解消

目的: 実害のある項目を先に消す。

- `app/api/calendar/events/route.ts` の GET 副作用を別責務へ移す
- Query 結果の丸ごと購読をやめ、必要プロパティだけ分割購読する
- `ShiftForm` / `ConfirmShiftCard` の prop-to-state 同期をやめる
- `pnpm-workspace.yaml` の hardening 設定を追加する

推奨分割:

- Task 1: GET handler 副作用の整理
- Task 2: TanStack Query 購読の修正
- Task 3: `ShiftForm` / `ConfirmShiftCard` の state 初期化方針修正
- Task 4: pnpm hardening

完了条件:

- suppression 済み許容項目を除き、React Doctor の未解決 `error` がゼロ
- セキュリティ系の未判断項目が残っていない

### Phase 1.5: 高頻度画面の低リスク state/effect 整理

目的: 巨大フォームへ入る前に、高頻度導線の低リスク負債を先に減らす。

- `dashboard-page-client` の `month` / `displayMonth` 二重 state と effect chain を整理する
- `shift-list-page-client` の表示月同期・選択 state 同期を局所的に整理する
- 必要に応じて `use-month-shifts` の Query 購読範囲と derived state を絞る
- live path 上の低リスク a11y 指摘（`role="button"` など）はこの段階で先に回収する

完了条件:

- ダッシュボードとシフト一覧の主要な `no-effect-chain` / `no-derived-state` 発生源が減っている
- 実利用コンポーネント上の低リスク a11y 指摘が後段待ちになっていない

### Phase 2: `ShiftForm` の state 設計を整理

目的: 再発しやすい React state 負債を構造から減らす。

- `ShiftForm` を以下へ分割する
  - 初期データ解決
  - 入力 state
  - 勤務先依存の派生値
  - 給与プレビュー

完了条件:

- `ShiftForm` に集中している `no-derived-state`, `no-effect-chain`, `prefer-useReducer`, `no-giant-component` の主要発生源が収束している

### Phase 3: `BulkShiftForm` の state 設計を整理

目的: 診断件数が最も多いフォームを責務分離して再発しにくくする。

- `BulkShiftForm` を以下へ分割する
  - データ取得
  - カレンダー選択と永続化
  - 行編集 state
  - 給与プレビュー入力変換
  - 送信

完了条件:

- `BulkShiftForm` に集中している `no-derived-state`, `no-effect-chain`, `prefer-useReducer`, `no-giant-component` の主要発生源が収束している

### Phase 4: 勤務先系フォームの state 設計を整理

目的: 中規模フォームの派生 state と購読範囲を整理する。

- `timetable-form` と `payroll-rule-form` に reducer または専用 hook を導入して、派生 state を render 時導出へ寄せる
- Query 結果の購読範囲を狭め、フォーム初期化ロジックを局所化する

完了条件:

- `timetable-form` / `payroll-rule-form` の `query-destructure-result`, `prefer-useReducer`, `no-derived-state` の主要発生源が収束している

### Phase 5: API スキーマと非同期処理の整理

目的: 将来互換性とレスポンス性能を落とさない状態にする。

- Zod 4 非推奨 API を一括で現行 API に置換する
- `app/api/*` と `lib/google-calendar/*` のうち、独立処理をループ内 `await` で逐次実行している箇所から直す
- ループ内の `includes` / `.sort()` / 多重走査を、シフト一覧・一括登録・給与プレビューなど件数の多い経路から見直す

完了条件:

- Zod 関連 warning が消えている
- Calendar / bulk shift / payroll preview まわりの性能 warning が主要経路で減っている

### Phase 6: 死蔵コードと重い依存の整理

目的: 保守対象を減らし、誤診断と無駄なバンドル候補を消す。

- `unused-file` の14件を、削除・再接続・意図的保留に分類する
- `unused-export` の20件を縮小する
- `components/chart-area-interactive.tsx` は未使用前提で再確認し、原則は削除を優先する

完了条件:

- 未使用ファイル/エクスポートの大半が整理されている
- サンプル由来コードが本流コードに混ざっていない

### Phase 7: アクセシビリティと表示整合性の仕上げ

目的: 最後に UI の仕上げを行う。

- Phase 1.5 で拾い切れなかったアクセシビリティ warning を解消する
- ラベル欠落を解消する
- `new Date()` など hydration mismatch を起こす render-time 値を整理する

完了条件:

- アクセシビリティ warning が実使用コンポーネントで解消している
- hydration mismatch warning が消えている

## 6. 実装順の提案

1. Phase 0
2. Phase 1
3. Phase 1.5
4. Phase 2 のうち `ShiftForm`
5. Phase 3 のうち `BulkShiftForm`
6. Phase 4 のうち `timetable-form` / `payroll-rule-form`
7. Phase 5
8. Phase 6
9. Phase 7

理由:

- `error` とセキュリティを先に解消しないと、後続のリファクタが安全に進まない
- ダッシュボードとシフト一覧は高頻度画面であり、低リスクな state/effect 修正を巨大フォームより先に取る価値が高い
- シフト系フォームが診断件数の最大ボトルネックであること自体は変わらないが、一覧系の小タスクを先に片付けた方が安全に進めやすい
- dead code cleanup は後段でもよいが、live path 上の a11y は先に触れる

## 7. 実装時の検証方針

コードに触れるタスクごとに以下を実行する。

- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm format`
- `react-doctor` 再実行

補足:

- docs-only タスクでない限り、上記は各タスク完了時に回す
- 実装はこの計画をそのまま1回でやらず、タスク単位でコミットを分ける

## 8. 今回の結論

現状の主問題は、単発の lint ではなく **シフト系フォーム群に集中した state/effect 設計負債** と **React Query / API 周りの横断的な実装パターンの乱れ** にある。

したがって、次回以降の改善は以下の順で進めるのが妥当。

1. Phase 0 で fix と suppression の境界、およびその保存先を確定する
2. `error` とセキュリティを先に解消する
3. 高頻度画面の低リスク state/effect 修正と live path の a11y を先に回収する
4. `ShiftForm` と `BulkShiftForm` を中心に state 設計をやり直す
5. API スキーマ互換性、性能 warning、dead code を整理する
6. 最後に残件のアクセシビリティと hydration mismatch を詰める
