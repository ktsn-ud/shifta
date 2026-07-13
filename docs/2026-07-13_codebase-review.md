# 2026-07-13 コードベース横断レビュー

## 対象

- `docs/DESIGN_SPECIFICATION.md` と現行実装の照合
- `app/`, `components/`, `lib/`, `prisma/schema.prisma` の主要導線・業務ロジック・API

## サマリー

このレビューでは、実害のある機能欠陥 2 件、設計書との重要な齟齬 4 件、実装品質上の改善事項 1 件を確認した。

## Findings

### 1. Major: 給与ルールの重複期間を API が保存できてしまう

- 設計書では、同一勤務先内の給与ルールについて `startDate ≤ shift.date < endDate` で評価しつつ、適用期間の重複を許さないとしている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:267`, `docs/DESIGN_SPECIFICATION.md:285`
- しかし実装は、重複候補を検出しても作成・更新を止めず、`warning` を返すだけで保存する。
  - 作成: `app/api/workplaces/[workplaceId]/payroll-rules/route.ts:160-220`
  - 更新: `app/api/workplaces/[workplaceId]/payroll-rules/[id]/route.ts:209-239`
- 集計側は重複ルールを前提にしておらず、該当日に複数ルールがあっても `startDate` 降順で最初に見つかった 1 件を採用する。
  - 根拠: `lib/payroll/summarizeByPeriod.ts:71-88`

影響:

- 仕様上は不正な状態を DB に保存できる。
- サマリー、給与詳細、プレビューが「どのルールが採用されたか」を利用者が把握しにくい状態で計算する。
- ルール編集だけで過去シフトの計算結果が意図せず変わる。

修正提案:

- `POST` / `PUT` ともに、重複検出時は `409` か `400` で reject する。
- もし「新ルール追加時に現在の open-ended ルールを自動で閉じる」運用を残すなら、その補正後に再度 overlap が 0 件であることを保証してから commit する。
- `app/api/workplaces/[workplaceId]/payroll-rules*` の route test を追加し、作成・更新ともに重複を保存できないことを固定する。

### 2. Major: 時間割 API が翌日跨ぎコマを禁止しており、設計書と矛盾している

- 設計書では `endTime < startTime` の時間割を翌日終了コマとして扱う仕様になっている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:360-365`
- しかし時間割セットの作成・更新 API は、`startTime < endTime` を必須にして翌日跨ぎを弾いている。
  - 作成: `app/api/workplaces/[workplaceId]/timetables/route.ts:61-68`
  - 更新: `app/api/workplaces/[workplaceId]/timetables/[id]/route.ts:55-59`
- 一方で、LESSON の時刻解決ロジック自体は翌日跨ぎコマを解釈できる設計になっている。
  - 根拠: `lib/shifts/lesson-time-range.ts:59-70`

影響:

- 設計書で許容されている深夜授業・日跨ぎ授業の時間割を登録できない。
- 既存の LESSON 計算ロジックに能力があるのに、入力段階で機能を失っている。

修正提案:

- 時間割 API とフォーム検証を「同時刻は不可、`endTime < startTime` は許容」に変更する。
- `23:50 -> 00:30` の作成・更新テストを追加する。
- 設計を時間割セット基準に寄せるなら、設計書 3.4 の制約記述も合わせて更新する。

### 3. Moderate: `ShiftType=OTHER` が設計書に残っているが、実装は `NORMAL` / `LESSON` のみ

- 設計書では `shiftType` に `OTHER` を含めている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:418-445`
- しかし Prisma schema、API 入力、UI の型はすべて `NORMAL` / `LESSON` の 2 値のみ。
  - Schema: `prisma/schema.prisma:85-88`
  - API: `app/api/shifts/_shared.ts:38-45`
  - UI: `components/shifts/ShiftForm.tsx:76-77`

影響:

- 設計書どおりに実装を読もうとすると、存在しないシフト種別を前提にしてしまう。
- 将来の保守で `OTHER` をサポート済みと誤認しやすい。

修正提案:

- `OTHER` を廃止済みなら、設計書から削除する。
- まだ必要要件なら、DB enum、API schema、単体/一括入力 UI、給与計算表示を end-to-end で実装する。

### 4. Moderate: `/my/timetable` が設計書の主要ルートにあるが、実装されていない

- 主要ルート表では `/my/timetable` が SCR_012 の入口として定義されている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:72-83`
- 実装上は勤務先配下の `/my/workplaces/[workplaceId]/timetables` 系しか存在せず、`/my/timetable` の page/redirect はない。
  - 実装ファイル: `app/my/(requires-calendar)/workplaces/[workplaceId]/timetables/page.tsx`
  - 旧 URL redirect があるのは `/my/workplace` のみ: `app/my/(requires-calendar)/workplace/page.tsx:8-9`
  - `app/my/(requires-calendar)` 直下にも `timetable` ディレクトリは存在しない

影響:

- 設計書や外部メモから `/my/timetable` にアクセスすると 404 になる。
- 時間割管理の入口仕様が、設計と実装で一致していない。

修正提案:

- 実装を維持するなら、設計書から `/my/timetable` を外し、勤務先配下ルートを正本として明記する。
- 入口ルートが必要なら、勤務先選択ページか `/my/workplaces` への redirect page を追加する。

### 5. Minor: 認証方式の記述が実装と一致していない

- 設計書は「NextAuth.js を使用したメール認証」と記載している。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:53-56`
- 実装は Google provider のみで、ログイン画面も Google サインイン前提になっている。
  - Provider: `lib/auth.ts:78-89`
  - ログイン画面: `app/login/page.tsx:71-85`
  - ボタン: `components/auth/login-button.tsx:8-15`

影響:

- セットアップや仕様確認時に、認証方式を誤認する。
- 障害調査時に「メール認証の挙動」を探しても該当実装が存在しない。

修正提案:

- 設計書を Google OAuth 前提へ更新する。
- もしメール認証が要件として残っているなら、実装計画を別タスク化する。

### 6. Minor: `/my/payroll` と `/my/payroll-details` の定義が設計書内で競合している

- 2.1 の主要ルート表では `/my/payroll` が入口とされている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:79-83`
- しかし後半仕様では `/my/payroll-details` が正本として定義され、実装もそちらに揃っている。
  - 設計書後半: `docs/DESIGN_SPECIFICATION.md:1836-1842`
  - 実装: `app/my/(requires-calendar)/payroll-details/page.tsx:3-4`
  - ナビゲーション: `components/app-sidebar.tsx:81-99`

影響:

- 実装の問題というより設計書の自己矛盾で、レビュー・実装判断の足場を崩す。

修正提案:

- 2.1 のルート表を現行の `/my/payroll-details` に合わせる。
- `/my/payroll` を残す意思があるなら alias redirect を追加する。

### 7. Minor: 実給与更新 API だけ JSON 異常系で 500 になりうる

- 多くの mutation route は `parseJsonBody()` を使い、CSRF 検証と JSON parse error の `400` を共通化している。
  - 根拠: `lib/api/http.ts:38-79`
- しかし `PUT /api/payroll/actual` だけは `await request.json()` を直接呼び、`safeParse` 前に JSON parse 例外が起きると catch されて `500` になる。
  - 根拠: `app/api/payroll/actual/route.ts:72-99`

影響:

- 壊れた JSON で 500 を返し、利用者向けにはサーバー障害に見える。
- 同系 API とエラーハンドリング契約が揃っていない。

修正提案:

- `parseJsonBody()` に寄せて `400` / `403` を統一する。
- `app/api/payroll/actual` に route test を追加する。現状、API テスト一覧にこの route は存在しない。

## テスト観点の不足

- `app/api/workplaces/[workplaceId]/payroll-rules*` の route test がない。
- `app/api/workplaces/[workplaceId]/timetables*` の route test がない。
- `app/api/payroll/actual` の route test がない。
- 既存 API テスト一覧: `app/api/calendar/events/__tests__/route.test.ts`, `app/api/calendar/initialize/__tests__/route.test.ts`, `app/api/payroll/summary*/__tests__/route.test.ts`, `app/api/shifts/**/__tests__`, `app/api/users/me/__tests__/route.test.ts`, `app/api/workplaces/**/__tests__`

## 推奨アクション順

1. 給与ルール重複保存の禁止を先に直す。
2. 時間割の翌日跨ぎ許容を API/UI/テストで揃える。
3. 設計書の route/auth/shiftType 記述を現行実装へ同期する。
4. `payroll-rules`, `timetables`, `actual payroll` の route test を追加する。
