# React Doctor Phase 0 判定メモ

作成日: 2026-06-24

## 1. 目的

`docs/REACT_DOCTOR_IMPROVEMENT_PLAN_20260619.md` の Phase 0 に基づき、fix 対象と suppression 候補のうち、先に判断できる項目を文書化して `doctor.config.*` へ反映する。

今回は「安全性を確認したうえで、現時点では許容するが今後も検知は残したい」項目だけを対象にするため、React Doctor の設定は `off` ではなく `warn` に下げる。

## 2. 判定結果

### 2.1 `react-doctor/server-auth-actions`

- 設定: `warn`
- 対象: [lib/actions/auth.ts](/workspace/lib/actions/auth.ts)
- 判定理由:
  - 現在の exported server action は `signOutAction` と `signOutForGoogleTokenExpiredAction` の2件だけで、どちらも `signOut()` に固定リダイレクト先を渡すだけでアプリケーションデータを書き換えない。
  - ログアウト導線は仕様上「全画面から利用可能」であり、認証済み画面の共通導線として成立している（`docs/DESIGN_SPECIFICATION.md` の画面遷移仕様）。
  - 一方で、このルールを完全に無効化すると、将来追加されるデータ更新系 server action まで見逃すため、`off` にはしない。

### 2.2 `react-doctor/url-prefilled-privileged-action`

- 設定: `warn`
- 対象: [lib/shifts/page-search-params.ts](/workspace/lib/shifts/page-search-params.ts), [lib/shifts/**tests**/page-search-params.test.ts](/workspace/lib/shifts/__tests__/page-search-params.test.ts)
- 判定理由:
  - URL 由来の `returnTo` は `allowlistedShiftFormReturnTo()` で `"dashboard"` または `"list"` に正規化され、それ以外の値は `"dashboard"` にフォールバックする。
  - 配列値は `readSingleParam()` で無視され、外部 URL 文字列もテストで `"dashboard"` へ丸められることを確認済み。
  - この値はシフト登録・編集後の戻り先 UI を切り替えるだけで、権限昇格や危険な遷移先注入には使われていない。
  - ただし、将来別の URL 事前入力パラメータが増えた際には引き続き検知したいため、`off` ではなく `warn` に留める。

## 3. 今回の範囲外

- 未使用コンポーネント由来のアクセシビリティ指摘の棚卸し
- GET handler の副作用整理
- Query 購読範囲の見直し

これらは別タスクとして継続する。
