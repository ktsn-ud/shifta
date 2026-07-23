# 2026-07-13 UI/UX 横断調査

## 対象

- `docs/DESIGN_SPECIFICATION.md`
- `app/`, `components/`, `hooks/`, `lib/` の主要 UI 導線
- 対象機能
  - ダッシュボード / カレンダー
  - シフト一覧 / 単体登録 / 一括登録 / 確定
  - 給与サマリー / 給与詳細
  - ログイン / カレンダー初期設定
  - 勤務先 / 給与ルール / 時間割

## 調査方法

- `Main` が設計書と主要画面を静的読解
- サブエージェントで以下を並列調査
  - ダッシュボード / 給与系
  - シフト操作系
  - ログイン / ナビゲーション / 勤務先設定系
- Next.js dev server は未起動だったため、実行時確認ではなくコード読解ベース

## サマリー

全体として、基本導線は揃っている一方で、以下の傾向が強いです。

- 月・年など「期間コンテキスト」が URL や画面間で保持されず、戻る / 再読込 / 比較に弱い
- テーブル中心の画面が多く、狭い画面での可読性と操作性に不安がある
- 空状態、無効状態、エラー状態で「次に何をすればよいか」の案内が弱い
- 一括登録や初期設定など入力負荷の高い画面で、誤操作防止とフィードバックがやや不足している

## 対応状況（2026-07-19）

- P1（1〜4）、P2（5〜12）、P3（13〜15）は実装・検証・レビュー・コミット済みです。
- 各変更の詳細と検証結果は Git 履歴を参照してください。
- 以下のレビュー本文は、調査時点の提案と根拠を残すため削除していません。

---

## P1: 優先して改善したい項目

### 1. 月移動・期間切替の状態を URL に載せる

- ダッシュボード、シフト一覧、一括登録の月移動は client state 中心で、再読込や共有、戻る/進むで見ていた月が復元されません。
- 月単位が主導線の画面で状態が URL に出ないのは、一般的な期待とずれます。
- 改善案
  - `month` / `year` を query param に同期する
  - 月移動は `router.replace` で URL を更新する
  - 表示中の月をヘッダー近くで常に明示する
- 根拠
  - [app/my/(requires-calendar)/page.tsx](</workspace/app/my/(requires-calendar)/page.tsx:33>)
  - [components/dashboard/dashboard-page-client.tsx](/workspace/components/dashboard/dashboard-page-client.tsx:648)
  - [components/shifts/shift-list-page-client.tsx](/workspace/components/shifts/shift-list-page-client.tsx:823)
  - [components/shifts/shift-list-page-client.tsx](/workspace/components/shifts/shift-list-page-client.tsx:985)
  - [components/shifts/BulkShiftForm.tsx](/workspace/components/shifts/BulkShiftForm.tsx:1124)
  - [components/shifts/BulkShiftForm.tsx](/workspace/components/shifts/BulkShiftForm.tsx:1323)

### 2. 給与詳細の表示切替で対象期間を引き継ぐ

- 月別表示と勤務先別表示の切替は固定リンクで、`month` / `year` を保持しません。
- 比較のための切替なのに文脈が落ちるため、期間を見失いやすいです。
- 改善案
  - 切替リンクに現在の `month` / `year` を引き継ぐ
  - 可能なら「同じ期間を別ビューで見る」ことが伝わるラベルにする
- 根拠
  - [components/payroll-details/payroll-details-view-switch.tsx](/workspace/components/payroll-details/payroll-details-view-switch.tsx:11)
  - [app/my/(requires-calendar)/payroll-details/monthly/page.tsx](</workspace/app/my/(requires-calendar)/payroll-details/monthly/page.tsx:27>)
  - [app/my/(requires-calendar)/payroll-details/workplace-yearly/page.tsx](</workspace/app/my/(requires-calendar)/payroll-details/workplace-yearly/page.tsx:24>)

### 3. 深い設定画面でも「どの勤務先を触っているか」を常時見せる

- 勤務先配下の給与ルール / 時間割ページでも、ヘッダーのパンくずは汎用ラベル中心で勤務先名が出ません。
- 複数勤務先を持つ前提では、対象取り違えの不安が強くなります。モバイルでは中間パンくず省略でさらに文脈を失います。
- 改善案
  - パンくずを `勤務先一覧 > {勤務先名} > 給与ルール` のようにする
  - モバイルでも最後の 2 階層は省略しない
  - 少なくとも本文ヘッダー副題に勤務先名を入れる
- 根拠
  - [components/site-header.tsx](/workspace/components/site-header.tsx:37)
  - [components/site-header.tsx](/workspace/components/site-header.tsx:167)
  - [components/workplaces/payroll-rule-list.tsx](/workspace/components/workplaces/payroll-rule-list.tsx:249)
  - [components/workplaces/payroll-rule-form.tsx](/workspace/components/workplaces/payroll-rule-form.tsx:935)
  - [components/workplaces/timetable-list.tsx](/workspace/components/workplaces/timetable-list.tsx:205)

### 4. 一括登録は「どこが失敗したか」を面で返す

- 一括登録の送信失敗は各行の inline error に寄り、送信時の要約が弱いです。
- 行数が増えるほど「どの行を直せばよいか」の探索コストが高くなります。
- 改善案
  - エラー要約パネルを追加する
  - 失敗した日付、件数、最初の修正対象をまとめて示す
  - 送信後に最初の invalid field へスクロール / フォーカスする
- 根拠
  - [components/shifts/BulkShiftForm.tsx](/workspace/components/shifts/BulkShiftForm.tsx:1460)
  - [components/shifts/BulkShiftForm.tsx](/workspace/components/shifts/BulkShiftForm.tsx:1779)
  - [components/shifts/BulkShiftForm.tsx](/workspace/components/shifts/BulkShiftForm.tsx:1788)
  - [components/shifts/bulk-shift-form/rows-section.tsx](/workspace/components/shifts/bulk-shift-form/rows-section.tsx:37)
  - [components/shifts/bulk-shift-form/row-card.tsx](/workspace/components/shifts/bulk-shift-form/row-card.tsx:44)

---

## P2: 体験を大きく良くする項目

### 5. ダッシュボードの日付操作を一貫させる

- 現状は「シフトありの日はモーダル」「空の日は新規登録画面へ遷移」と、同じ日付クリックで挙動が分かれます。
- さらにヘッダーの `新規シフト登録` は表示中の月ではなく `today` 基準です。
- 改善案
  - 日付クリック時は常に日別モーダル / ドロワーを開く
  - 空状態の中に `この日に追加` CTA を置く
  - ヘッダー CTA は表示中の月か直近選択日を初期値にする
- 根拠
  - [components/dashboard/dashboard-page-client.tsx](/workspace/components/dashboard/dashboard-page-client.tsx:755)
  - [components/dashboard/dashboard-page-client.tsx](/workspace/components/dashboard/dashboard-page-client.tsx:864)
  - [components/calendar/ShiftListModal.tsx](/workspace/components/calendar/ShiftListModal.tsx:144)

### 6. カレンダーの情報発見性を上げる

- 月間カレンダーの各セルに記載できる情報量は限られており、現状の時刻と色点は必要十分です。
- そのため、セル内へ静的な勤務先名・補助文言・`+` ヒントなどを追加する改善は行いません。
- 空セルも「押すと追加できる」ことが視覚的に弱い一方、セル内の常時表示を増やすと一覧性を損ないます。
- 改善案
  - セル内の静的表示は現状の情報量を維持する
  - 日付クリック後のモーダル / ドロワー側で勤務先名や追加 CTA を明確にする
  - hover/focus 時など操作中に限り、追加可能であることが伝わる表現を強める
- 根拠
  - [components/calendar/MonthCalendar.tsx](/workspace/components/calendar/MonthCalendar.tsx:188)
  - [components/calendar/MonthCalendar.tsx](/workspace/components/calendar/MonthCalendar.tsx:200)
  - [components/dashboard/dashboard-page-client.tsx](/workspace/components/dashboard/dashboard-page-client.tsx:864)

### 7. 横に広いテーブルは狭い画面用の表現を持たせる

- 給与サマリーは勤務先ごとに 3 列ずつ増える固定幅テーブルです。
- 勤務先別年次詳細は 13 列のテーブルを `overflow-hidden` 容器で包んでいます。
- 勤務先一覧や給与ルール一覧も、複数 CTA を横並びで載せたテーブル中心です。
- 改善案
  - `overflow-x-auto` とスクロールヒントを最低限入れる
  - モバイルではカード / アコーディオン化する
  - 一覧の操作群は `詳細` または `その他` メニューへ寄せる
- 根拠
  - [components/summary/summary-page-client.tsx](/workspace/components/summary/summary-page-client.tsx:215)
  - [components/payroll-details/payroll-details-workplace-yearly-page-client.tsx](/workspace/components/payroll-details/payroll-details-workplace-yearly-page-client.tsx:298)
  - [components/workplaces/workplace-list.tsx](/workspace/components/workplaces/workplace-list.tsx:242)
  - [components/workplaces/workplace-list.tsx](/workspace/components/workplaces/workplace-list.tsx:313)
  - [components/workplaces/payroll-rule-list.tsx](/workspace/components/workplaces/payroll-rule-list.tsx:308)

### 8. 勤務先管理の空状態・無効状態で次アクションを明示する

- 空状態が `ありません` だけで終わる画面が多く、GENERAL 勤務先の `時間割` ボタンは disabled 表示です。
- 一般的には「次に何をすればよいか」が欲しい局面で、説明不足です。
- 改善案
  - 空状態を専用カード化し、理由と CTA を置く
  - disabled ボタンは隠すか、使えない理由を明記する
- 根拠
  - [components/workplaces/workplace-list.tsx](/workspace/components/workplaces/workplace-list.tsx:254)
  - [components/workplaces/workplace-list.tsx](/workspace/components/workplaces/workplace-list.tsx:343)
  - [components/workplaces/payroll-rule-list.tsx](/workspace/components/workplaces/payroll-rule-list.tsx:320)
  - [components/workplaces/timetable-list.tsx](/workspace/components/workplaces/timetable-list.tsx:217)

### 9. 勤務先作成は初回入力の負荷を下げる

- 新規勤務先では `初期給与ルールを同時に作成する` がデフォルト ON で、多数の設定項目を初回から求めます。
- しかも `所定時間外割増率（保留）` のように、現時点で未使用の項目も並びます。
- 改善案
  - まず勤務先基本情報だけで保存できる流れを優先する
  - 給与ルールは次画面または折りたたみの詳細設定に分離する
  - 未使用項目は `高度な設定` に逃がす
- 根拠
  - [components/workplaces/workplace-form.tsx](/workspace/components/workplaces/workplace-form.tsx:197)
  - [components/workplaces/workplace-form.tsx](/workspace/components/workplaces/workplace-form.tsx:637)
  - [components/workplaces/workplace-form.tsx](/workspace/components/workplaces/workplace-form.tsx:785)
  - [components/workplaces/workplace-form.tsx](/workspace/components/workplaces/workplace-form.tsx:1181)

### 10. 時間割作成の保存モデルを分かりやすくする

- `時間割セットを確定` と `まとめて作成` の 2 段階で保存され、途中状態と最終保存の境界が読み取りづらいです。
- 作成済みと未保存の差が分かりにくく、初見では迷いやすい導線です。
- 改善案
  - `追加して続ける` / `保存して完了` のように役割を分ける
  - ステップ表示とキュー要約を強める
- 根拠
  - [components/workplaces/timetable-form.tsx](/workspace/components/workplaces/timetable-form.tsx:668)
  - [components/workplaces/timetable-form.tsx](/workspace/components/workplaces/timetable-form.tsx:771)
  - [components/workplaces/timetable-form.tsx](/workspace/components/workplaces/timetable-form.tsx:1090)

### 11. シフト一覧・一括登録の誤操作フィードバックを増やす

- シフト一覧では月を変えると選択状態が実質消えます。
- 一括登録ではデフォルト変更が既存行に自動反映されず、`デフォルト値を適用` の影響範囲も見えにくいです。
- 改善案
  - 月変更時の選択解除を明示する
  - `N日分へ反映` など適用件数を出す
  - 可能なら未編集行だけ自動反映する
- 根拠
  - [components/shifts/shift-list-page-client.tsx](/workspace/components/shifts/shift-list-page-client.tsx:833)
  - [components/shifts/shift-list-page-client.tsx](/workspace/components/shifts/shift-list-page-client.tsx:839)
  - [components/shifts/BulkShiftForm.tsx](/workspace/components/shifts/BulkShiftForm.tsx:1365)
  - [components/shifts/BulkShiftForm.tsx](/workspace/components/shifts/BulkShiftForm.tsx:1439)
  - [components/shifts/bulk-shift-form/defaults-section.tsx](/workspace/components/shifts/bulk-shift-form/defaults-section.tsx:300)

### 12. 入力エラーは「どこを直すか」が分かる形で返す

- 単体シフトでは `ERR_001` `ERR_003` のような内部コードが画面メッセージに残っています。
- 確定カードのエラーはカード下部の 1 メッセージで、どの入力が悪いかが弱いです。
- 一覧からの編集導線も勤務先名テキスト依存で、発見しづらいです。
- 改善案
  - 画面表示から内部コードを外し、自然文に統一する
  - フィールド単位の inline error とフォーカス移動を入れる
  - シフト一覧は行クリックまたは明示的な `編集` ボタンにする
- 根拠
  - [components/shifts/ShiftForm.tsx](/workspace/components/shifts/ShiftForm.tsx:1067)
  - [components/shifts/ShiftForm.tsx](/workspace/components/shifts/ShiftForm.tsx:1234)
  - [components/shifts/ShiftForm.tsx](/workspace/components/shifts/ShiftForm.tsx:2328)
  - [components/shifts/ConfirmShiftCard.tsx](/workspace/components/shifts/ConfirmShiftCard.tsx:53)
  - [components/shifts/ConfirmShiftCard.tsx](/workspace/components/shifts/ConfirmShiftCard.tsx:235)
  - [components/shifts/shift-list-page-client.tsx](/workspace/components/shifts/shift-list-page-client.tsx:686)
  - [components/shifts/shift-list-page-client.tsx](/workspace/components/shifts/shift-list-page-client.tsx:719)

---

## P3: 整えると効く項目

### 13. 給与詳細の空状態は詳細 UI と分離する

- 対象月 / 対象年にシフトがない表示の下でも、0円・0時間のサマリーや詳細 UI を描画しています。
- `データがない` と `結果が 0` が混ざって見え、空画面の理解コストが高いです。
- 改善案
  - 空状態では詳細カード群を出さず、期間変更やシフト登録 CTA を優先する
- 根拠
  - [components/payroll-details/payroll-details-monthly-page-client.tsx](/workspace/components/payroll-details/payroll-details-monthly-page-client.tsx:462)
  - [components/payroll-details/payroll-details-monthly-page-client.tsx](/workspace/components/payroll-details/payroll-details-monthly-page-client.tsx:511)
  - [components/payroll-details/payroll-details-workplace-yearly-page-client.tsx](/workspace/components/payroll-details/payroll-details-workplace-yearly-page-client.tsx:443)
  - [components/payroll-details/payroll-details-workplace-yearly-page-client.tsx](/workspace/components/payroll-details/payroll-details-workplace-yearly-page-client.tsx:495)

### 14. 給与ルールの終了日ラベルを誤解しにくくする

- UI は `終了日` とだけ見せますが、実装上は end date 境界に含意があります。
- ユーザー視点では「この日まで有効」か「この日から無効」かを誤解しやすいです。
- 改善案
  - `適用終了日（この日まで）` のように含意を明示する
  - 一覧側の期間表記にも注釈を揃える
- 根拠
  - [components/workplaces/payroll-rule-form.tsx](/workspace/components/workplaces/payroll-rule-form.tsx:530)
  - [components/workplaces/payroll-rule-form.tsx](/workspace/components/workplaces/payroll-rule-form.tsx:785)
  - [components/workplaces/payroll-rule-list.tsx](/workspace/components/workplaces/payroll-rule-list.tsx:320)

### 15. ログイン後の初回導線を事前に見せる

- ログイン画面では、初回ログイン後に `/my/calendar-setup` を通ることが画面上で分かりません。
- 初見ユーザーには「ログイン後すぐ使える」と見えやすく、次画面が唐突に感じられます。
- 改善案
  - `初回は Google Calendar の初期設定があります` をログイン画面に 1 行入れる
  - 初期設定画面にも完了後の流れをもう少し明示する
- 根拠
  - [app/login/page.tsx](/workspace/app/login/page.tsx:76)
  - [app/my/calendar-setup/page.tsx](/workspace/app/my/calendar-setup/page.tsx:76)
