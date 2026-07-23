# 2026-07-13 コードベース横断レビュー

## 対象

- `docs/DESIGN_SPECIFICATION.md` と現行実装の照合
- `app/`, `components/`, `lib/`, `prisma/schema.prisma` の主要導線・業務ロジック・API

## サマリー

このレビューでは、実装指摘として有効だったのは finding #7 のみであり、finding #1-#6 は `docs/DESIGN_SPECIFICATION.md` 側の現行実装との整合事項として扱う。finding #7 は本ブランチで修正済み。

## Findings

### 1. Design alignment: 給与ルールの重複期間に関する記述を設計書へ合わせる

- 設計書では、同一勤務先内の給与ルールについて `startDate ≤ shift.date < endDate` で評価しつつ、適用期間の重複を許さないとしていた。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:267`, `docs/DESIGN_SPECIFICATION.md:285`
- 現行実装は、重複候補を検出しても作成・更新を止めず、`warning` を返すだけで保存する。
  - 作成: `app/api/workplaces/[workplaceId]/payroll-rules/route.ts:160-220`
  - 更新: `app/api/workplaces/[workplaceId]/payroll-rules/[id]/route.ts:209-239`
- 集計側は重複ルールを前提にしておらず、該当日に複数ルールがあっても `startDate` 降順で最初に見つかった 1 件を採用する。
  - 根拠: `lib/payroll/summarizeByPeriod.ts:71-88`

設計書更新メモ:

- 現行実装を正として、重複候補ありでも保存する挙動を設計書側に明記する。
- もし将来、保存拒否へ変えるなら別タスクで実装と設計書を同時更新する。

### 2. Design alignment: 時間割の翌日跨ぎ可否を設計書へ合わせる

- 設計書では `endTime < startTime` の時間割を翌日終了コマとして扱う仕様になっている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:360-365`
- 現行実装は、時間割セットの作成・更新 API で `startTime < endTime` を必須にして翌日跨ぎを弾いている。
  - 作成: `app/api/workplaces/[workplaceId]/timetables/route.ts:61-68`
  - 更新: `app/api/workplaces/[workplaceId]/timetables/[id]/route.ts:55-59`
- 一方で、LESSON の時刻解決ロジック自体は翌日跨ぎコマを解釈できる設計になっている。
  - 根拠: `lib/shifts/lesson-time-range.ts:59-70`

設計書更新メモ:

- 現行実装を正として、翌日跨ぎ不可の制約を設計書へ反映する。
- もし翌日跨ぎを許容するなら別タスクで API/UI/設計書を同時更新する。

### 3. Design alignment: `ShiftType=OTHER` の記述を設計書へ合わせる

- 設計書では `shiftType` に `OTHER` を含めていた。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:418-445`
- 現行実装は Prisma schema、API 入力、UI の型がすべて `NORMAL` / `LESSON` の 2 値のみ。
  - Schema: `prisma/schema.prisma:85-88`
  - API: `app/api/shifts/_shared.ts:38-45`
  - UI: `components/shifts/ShiftForm.tsx:76-77`

設計書更新メモ:

- `OTHER` を設計書から削除し、`NORMAL` / `LESSON` に揃える。
- もし将来 `OTHER` を再導入するなら別タスクで実装する。

### 4. Design alignment: `/my/timetable` を主要ルートから外す

- 主要ルート表では `/my/timetable` が SCR_012 の入口として定義されている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:72-83`
- 現行実装では勤務先配下の `/my/workplaces/[workplaceId]/timetables` 系しか存在せず、`/my/timetable` の page/redirect はない。
  - 実装ファイル: `app/my/(requires-calendar)/workplaces/[workplaceId]/timetables/page.tsx`
  - 旧 URL redirect があるのは `/my/workplace` のみ: `app/my/(requires-calendar)/workplace/page.tsx:8-9`
  - `app/my/(requires-calendar)` 直下にも `timetable` ディレクトリは存在しない

設計書更新メモ:

- `/my/timetable` を外し、勤務先配下ルートを正本として明記する。
- 入口ルートが必要なら別タスクで redirect page を追加する。

### 5. Design alignment: 認証方式の記述を現行実装へ合わせる

- 設計書は「NextAuth.js を使用したメール認証」と記載している。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:53-56`
- 現行実装は Google provider のみで、ログイン画面も Google サインイン前提になっている。
  - Provider: `lib/auth.ts:78-89`
  - ログイン画面: `app/login/page.tsx:71-85`
  - ボタン: `components/auth/login-button.tsx:8-15`

設計書更新メモ:

- 設計書を Google OAuth 前提へ更新する。
- メール認証が必要なら別タスク化する。

### 6. Design alignment: `/my/payroll` と `/my/payroll-details` の競合を解消する

- 2.1 の主要ルート表では `/my/payroll` が入口とされている。
  - 根拠: `docs/DESIGN_SPECIFICATION.md:79-83`
- しかし後半仕様では `/my/payroll-details` が正本として定義され、現行実装もそちらに揃っている。
  - 設計書後半: `docs/DESIGN_SPECIFICATION.md:1836-1842`
  - 実装: `app/my/(requires-calendar)/payroll-details/page.tsx:3-4`
  - ナビゲーション: `components/app-sidebar.tsx:81-99`

設計書更新メモ:

- 2.1 のルート表を `/my/payroll-details` に合わせる。
- `/my/payroll` を残すなら alias redirect を別タスクで追加する。

### 7. Resolved: 実給与更新 API の JSON 異常系を共通ハンドリングへ統一した

- 多くの mutation route は `parseJsonBody()` を使い、CSRF 検証と JSON parse error の `400` を共通化している。
  - 根拠: `lib/api/http.ts:38-79`
- 修正前は `PUT /api/payroll/actual` だけが `await request.json()` を直接呼び、`safeParse` 前に JSON parse 例外が起きると `500` になりえた。
  - 修正対象: `app/api/payroll/actual/route.ts`
- 現在は `parseJsonBody()` を使用し、malformed JSON を `400`、CSRF 異常系を `403` へ統一した。
  - 追加テスト: `app/api/payroll/actual/__tests__/route.test.ts`

修正結果:

- 壊れた JSON は `400 JSON形式が不正です` を返す。
- schema 不正 JSON は `400 入力値が不正です` を返す。
- CSRF 異常系は `403` を返す。
- 成功時の `data` wrapper と再検証呼び出しは維持している。

実施内容:

- `PUT /api/payroll/actual` を `parseJsonBody()` ベースへ変更した。
- `app/api/payroll/actual/__tests__/route.test.ts` を追加し、malformed JSON / schema invalid / CSRF invalid / invalid month / success path を固定した。

## テスト観点の不足

- `app/api/workplaces/[workplaceId]/payroll-rules*` の route test がない。
- `app/api/workplaces/[workplaceId]/timetables*` の route test がない。
- 既存 API テスト一覧: `app/api/calendar/events/__tests__/route.test.ts`, `app/api/calendar/initialize/__tests__/route.test.ts`, `app/api/payroll/actual/__tests__/route.test.ts`, `app/api/payroll/summary*/__tests__/route.test.ts`, `app/api/shifts/**/__tests__`, `app/api/users/me/__tests__/route.test.ts`, `app/api/workplaces/**/__tests__`

## 推奨アクション順

1. `docs/DESIGN_SPECIFICATION.md` の route/auth/shiftType/timetable/payroll-rules 記述を現行実装へ同期する。
2. `payroll-rules`, `timetables` の route test を追加し、現行仕様を固定する。
