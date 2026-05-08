# Google Calendar 認証期限切れ時の強制ログアウト対応 実装計画

作成日: 2026-05-01

## 背景

Google Calendar 同期時に `GoogleCalendarAuthError` の `TOKEN_EXPIRED` が発生することがある。現状は `lib/google-calendar/auth.ts` で access token の期限切れを検知すると refresh token による更新を試み、refresh token がない場合やトークン復号に失敗した場合に `TOKEN_EXPIRED` を投げる。

ただし、API応答とUIのエラー分類では `TOKEN_EXPIRED` が明示的な「再ログインが必要な状態」として扱われていない。そのため、ユーザーは通常の再実行やカレンダー再設定に誘導される可能性があり、Google OAuth トークンを正常な状態に戻しづらい。

## 現状整理

### 関連実装

- `lib/google-calendar/auth.ts`
  - `refreshGoogleTokenIfNeeded()` が access token の期限切れを判定する。
  - refresh token がない場合は `GoogleCalendarAuthError("TOKEN_EXPIRED", ...)` を投げる。
  - トークン復号失敗時も `TOKEN_EXPIRED` として扱っている。
- `lib/auth.ts`
  - Google provider には `access_type: "offline"` と `prompt: "consent"` を設定済み。
  - `signIn` callback で再ログイン時の `access_token` / `refresh_token` / `expires_at` を `Account` に保存している。
- `components/auth/login-button.tsx`
  - 通常ログインは `signIn("google", { redirectTo: "/my" })`。
- `lib/actions/auth.ts`
  - `signOutAction()` が `signOut({ redirectTo: "/login" })` を実行している。
- `lib/user-facing-error.ts`
  - `AUTH_ERROR_CODES` に `TOKEN_EXPIRED` が含まれていない。
- `app/api/calendar/initialize/route.ts`, `app/api/calendar/events/route.ts`
  - `GoogleCalendarAuthError` をHTTPステータスへ変換しているが、`TOKEN_EXPIRED` は専用扱いではない。
- `lib/google-calendar/syncStatus.ts`
  - Google API の 401 は「再ログインしてください」という文言になるが、エラーコードが `null` のためUI側の専用導線にはつながらない。

### 実行時確認

`next-devtools` では Next.js MCP サーバーを `localhost:3000` で確認済み。ルート一覧には `/login`, `/my/calendar-setup`, `/api/calendar/events`, `/api/calendar/initialize`, `/api/shifts/[id]/retry-sync` が含まれる。

現在のランタイムエラーには Neon/Prisma 接続断に起因する Auth.js エラーが出ているが、本計画の対象である Google OAuth 再ログイン導線とは別問題として扱う。

## 目的

- `TOKEN_EXPIRED` 発生時に、ユーザーへ理由を表示したうえでアプリセッションをログアウトする。
- ログアウト後は通常のGoogleログインへ戻し、既存のログインフローでOAuth tokenを保存し直す。
- Google Calendar 設定のやり直しが必要なケースと、Google OAuth 再ログインだけでよいケースを混同しない。
- データの正はアプリDBとし、Google Calendar 側の編集や逆同期は追加しない。
- ログアウト前に3秒の猶予を設け、突然画面が遷移したように見せない。

## 非目的

- refresh token を常に破棄して毎回OAuth再同意させること。
- ログイン済みセッションのままGoogle OAuthだけを再認可する専用導線を作ること。
- Google Calendar 側のイベント編集内容をアプリに逆同期すること。
- 複数ユーザー対応や追加のOAuth provider対応。
- Prisma schema変更やmigration作成。

## 採用方針

### 1. `TOKEN_EXPIRED` を強制ログアウト要求として扱う

`GoogleCalendarAuthError` の `TOKEN_EXPIRED` は、カレンダー再設定ではなくアプリセッションのログアウト要求として扱う。ログアウト後は通常の `/login` からGoogleログインをやり直す。

APIレスポンスの `details` には以下を含める。

```json
{
  "code": "TOKEN_EXPIRED",
  "requiresSignOut": true
}
```

HTTPステータスは `401` を基本とする。理由は、アプリセッション自体は残っていても、Google API に必要な外部認証資格情報が失効しているため、ユーザーに再認証を求める状態として扱うのが自然だからである。

再認証系の `401` レスポンスには `Cache-Control: no-store` を付与し、認証状態に関するメタ情報をキャッシュさせない。

### 2. 3秒猶予後にログアウトする

クライアントは `requiresSignOut` を受け取ったら、固定文言のtoastを表示し、3秒後にログアウトする。

表示文言候補:

- タイトル: `Google 連携の有効期限が切れました`
- 説明: `3秒後にログアウトします。再度Googleアカウントでログインしてください。`

ログアウトは期限切れ専用の小さなヘルパーに集約し、リダイレクト先はコード上の固定値 `/login?reason=google-token-expired` のみを使う。ヘルパーは外部からURLやcallback先を受け取らない。

既存の `signOutAction()` は通常ログアウト用として維持し、期限切れ用途では `signOutForGoogleTokenExpiredAction()` のような別関数を追加する。通常ログアウトと期限切れログアウトを分けることで、後から通常ログアウトの遷移先を変えても期限切れ時のセキュリティ前提が崩れないようにする。

ログアウトタイマーはコンポーネントのunmount時に `clearTimeout` し、二重発火を避ける。複数画面や複数API呼び出しで同じエラーが連続しても、ログアウト予約はアプリ内で一度だけ作成する。

### 3. ログイン画面にログアウト理由を表示する

`/login` に `reason=google-token-expired` のようなクエリを受け付ける。該当時は通常文言ではなく、Google Calendar連携の有効期限が切れたため再ログインが必要であることを表示する。

表示は生の例外メッセージを出さず、固定文言にする。

`reason` クエリは表示文言の切り替えだけに使う。このクエリを理由に自動ログアウト、自動Googleログイン、OAuth再認可開始、任意URLへのリダイレクトを実行しない。第三者が `/login?reason=google-token-expired` へのリンクを作れても、固定文言表示以外の副作用がない状態にする。

候補文言:

- タイトル: `Google 連携の再ログインが必要です`
- 説明: `Google Calendar と同期するため、Google アカウントで再ログインしてください。`
- ボタン: `Google でログイン`

### 4. クライアント側のAPIエラー分類を拡張する

`lib/user-facing-error.ts` に `TOKEN_EXPIRED` を認証系コードとして追加し、`requiresSignOut` を読めるようにする。

UI側は `requiresSignOut` が true の場合、3秒後にログアウトして `/login?reason=google-token-expired` へ遷移する。既存の `requiresCalendarSetup` はカレンダーID不整合やカレンダー削除などに限定して維持する。

### 5. 同期ステータス側にもログアウト要求を伝播する

`lib/google-calendar/syncStatus.ts` で `GoogleCalendarAuthError("TOKEN_EXPIRED")` を専用に分類し、`errorCode: "TOKEN_EXPIRED"` と `requiresSignOut: true` を返せるようにする。

現状の `GoogleSyncErrorCode` は `CALENDAR_NOT_FOUND` のみなので、同期エラーコードの型を以下のように拡張する。

- `CALENDAR_NOT_FOUND`: カレンダー再設定
- `TOKEN_EXPIRED`: 強制ログアウト

## 実装タスク

### T1. エラー型とAPI応答の拡張

対象:

- `lib/google-calendar/syncErrors.ts`
- `lib/google-calendar/syncStatus.ts`
- `app/api/calendar/initialize/route.ts`
- `app/api/calendar/events/route.ts`
- `app/api/shifts/[id]/retry-sync/route.ts`
- 必要に応じて `app/api/shifts/route.ts`, `app/api/shifts/bulk/route.ts`, `app/api/shifts/[id]/route.ts`, `app/api/shifts/[id]/confirm/route.ts`

実施内容:

- `TOKEN_EXPIRED` を同期エラーコードへ追加する。
- `requiresSignOutByErrorCode()` のような判定関数を追加する。
- `GoogleCalendarAuthError` の `TOKEN_EXPIRED` は `401` + `details.code` + `details.requiresSignOut` を返す。
- 同期失敗結果にも `requiresSignOut` を追加する。
- `TOKEN_EXPIRED` のAPI応答には `Cache-Control: no-store` を付与する。
- API応答の `details` には `code`, `requiresSignOut`, `requiresCalendarSetup` 以外の認証内部情報を含めない。access token, refresh token, scope一覧、Google API の生レスポンスは返さない。

検証:

- `GoogleCalendarAuthError("TOKEN_EXPIRED")` のAPI応答が `401` かつ `details.requiresSignOut: true` になること。
- `TOKEN_EXPIRED` のAPI応答に `Cache-Control: no-store` が付くこと。
- `TOKEN_EXPIRED` のAPI応答にOAuth tokenやGoogle APIの生エラー詳細が含まれないこと。
- `CALENDAR_NOT_FOUND` は引き続き `requiresCalendarSetup: true` になること。

### T2. ユーザー向けエラー分類の拡張

対象:

- `lib/user-facing-error.ts`
- `lib/google-calendar/clientSync.ts`

実施内容:

- `TOKEN_EXPIRED` を `AUTH_ERROR_CODES` に追加する。
- `ApiErrorMeta` と `ParsedGoogleSyncFailure` に `requiresSignOut` を追加する。
- `details.requiresSignOut` を解析し、認証系エラーとして扱う。
- ログアウト向けの誘導文言を `buildActionableErrorMessage()` で出せるようにする。

検証:

- `details.requiresSignOut: true` のレスポンスを解析すると、ログアウト予告付きの再ログイン誘導メッセージになること。
- 既存の `requiresCalendarSetup` の挙動が変わらないこと。

### T3. ログアウト導線とログイン画面表示の追加

対象:

- `lib/actions/auth.ts`
- `components/auth/login-button.tsx`
- `app/login/page.tsx`

実施内容:

- `signOutForGoogleTokenExpiredAction()` のような期限切れ専用ログアウト関数を追加し、固定の `/login?reason=google-token-expired` へ遷移させる。
- 期限切れ専用ログアウト関数は引数でリダイレクト先を受け取らない。
- ログアウト後の遷移先として `/login?reason=google-token-expired` を使えるようにする。
- `/login?reason=google-token-expired` の場合は再ログイン用の文言を表示する。
- 通常ログインと期限切れ後ログインのボタンは既存のGoogleログイン処理を共用する。
- `reason` クエリは表示文言の切り替えだけに使い、自動ログアウトや自動ログインを開始しない。

検証:

- 通常アクセス `/login` は現行文言のまま。
- `/login?reason=google-token-expired` は再ログイン文言を表示する。
- `/login?reason=google-token-expired` へ直接アクセスしても、OAuth開始や追加リダイレクトが自動実行されないこと。
- ログイン後は `redirectTo` で `/my` へ戻る。

### T4. 主要UIから3秒後にログアウトする

対象:

- `components/shifts/ShiftForm.tsx`
- `components/shifts/BulkShiftForm.tsx`
- `components/shifts/ConfirmShiftCard.tsx`
- `components/dashboard/dashboard-page-client.tsx`
- 必要に応じて calendar events を読む画面

実施内容:

- APIエラーまたは同期失敗に `requiresSignOut` がある場合、toast表示後に3秒待ってログアウトする。
- `requiresCalendarSetup` より `requiresSignOut` を優先して判定する。
- 既存の `CALENDAR_SETUP_PATH` と同様に、`GOOGLE_TOKEN_EXPIRED_LOGIN_PATH` 定数を追加して利用する。
- 3秒待機中に同じエラーが連続してもログアウト処理は一度だけ実行する。
- ログアウト予約中は追加の保存・再同期操作を実行しないよう、対象UIの送信ボタンや再実行ボタンを無効化する。

検証:

- `TOKEN_EXPIRED` ではカレンダー設定ページではなく、3秒後にログアウトしてログインページへ遷移する。
- 3秒の猶予中に同じエラーが複数回発生しても、ログアウト処理が一度だけ呼ばれること。
- 3秒の猶予中は追加の保存・再同期操作を開始できないこと。
- カレンダー削除などの `CALENDAR_NOT_FOUND` は従来通り `/my/calendar-setup` へ遷移する。

### T5. テスト追加

対象:

- `lib/google-calendar` 周辺の単体テスト
- `lib/user-facing-error` の単体テストがなければ追加
- `components/shifts` / `dashboard` の既存フローテスト

実施内容:

- `TOKEN_EXPIRED` のAPIメタ解析テスト。
- `requiresSignOut` が3秒後のログアウトに使われるテスト。
- 期限切れ専用ログアウト関数が固定の `/login?reason=google-token-expired` だけへ遷移するテスト。
- `CALENDAR_NOT_FOUND` がカレンダー再設定へ残る回帰テスト。
- `/login?reason=google-token-expired` の表示テスト。
- `/login?reason=google-token-expired` が表示以外の副作用を起こさないテスト。

検証コマンド:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm format
```

## 実装時の注意点

- Google Calendar 再ログインと Google Calendar 再設定は別導線にする。
- `TOKEN_EXPIRED` の生メッセージをUIに直接表示しない。
- refresh token が存在し、更新に成功する通常ケースでは、ユーザーへ再ログインを要求しない。
- OAuth token 保存方式は既存の暗号化保存を維持する。
- `TOKEN_EXPIRED` 時にログイン済みセッションのままGoogle OAuthだけを再認可する例外ルートは作らない。
- ログアウト先URLは固定の `/login?reason=google-token-expired` とし、外部URLや任意のcallback URLは受け付けない。
- `reason` クエリは信用境界の外側にある入力として扱い、許可済みの値だけ固定文言に変換する。不明な値は通常ログイン画面と同じ表示にする。
- ログアウト前の3秒猶予はユーザーへの説明時間であり、セッション延長や再試行時間として扱わない。
- Prisma schema変更は不要な想定。migrationは作成しない。
- `pnpm dev` はエージェント側では実行せず、必要時はユーザーに依頼する。

## 未決事項

- トークン復号失敗を `TOKEN_EXPIRED` のまま扱うか、別コードに分けるか。
  - ユーザー向け導線は同じ強制ログアウトでよいが、内部コードは `TOKEN_DECRYPTION_FAILED` のように分けることを推奨する。鍵設定ミス・鍵ローテーション失敗・DB上の暗号文破損を監視しやすくするため。
- Google API が直接 401 を返した場合に、常に `TOKEN_EXPIRED` とみなすか。
  - `GoogleCalendarAuthError` 由来は `TOKEN_EXPIRED`、Google API 401 は `GOOGLE_AUTH_FAILED` または `TOKEN_EXPIRED` へ正規化する方針を実装時に選ぶ。ユーザー導線はどちらも3秒後のログアウトでよい。

## 推奨実装順

1. T1でサーバー応答と同期失敗結果に `requiresSignOut` を通す。
2. T2でクライアント共通エラー分類を対応させる。
3. T3でログアウト後のログイン画面表示を追加する。
4. T4で主要UIの3秒後ログアウト処理を追加する。
5. T5で回帰テストと検証コマンドを通す。
