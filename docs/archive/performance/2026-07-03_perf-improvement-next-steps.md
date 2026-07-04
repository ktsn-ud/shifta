# パフォーマンス改善方針メモ（2026-07-03）

> この文書は 2026-07-03 時点の「次にやること」メモです。実装反映後の現行整理は `docs/performance/2026-07-04_initial-display-and-auth-optimizations.md` を参照してください。

## 1. 背景と目的

現状の `/my` 配下では、表示前の待ち時間がユーザー体感を下げている。

このメモの目的は、`/workspace` を初見の担当者でも、次に何をどの順番で進めるべきか判断できるようにすること。

前提は次のとおり。

- データの正はアプリケーション DB
- Google Calendar は表示・補助・外部連携用途であり、逆同期はしない
- 認可やユーザー境界を弱めて速度を稼ぐ方針は取らない
- MVP 範囲を優先し、未定義の拡張は後回しにする

## 2. 計測で分かった事実

`docs/performance/2026-07-03_perf_investiment_3.log` から、遅さの中心は `current-user` 系と `/my` の初期取得にある。

### 2.1 認証・現在ユーザー取得が重い

- `current-user:getSessionEmail:auth`
  - 1.6 秒前後のケースがあり、最大で 3.2 秒超まで伸びている
- `current-user:getCurrentUser:getCachedSessionEmail`
  - `getSessionEmail` の待ち時間をそのまま引き継いでいる
- `current-user:requireCurrentUser:getCachedSessionEmail`
  - `requireCurrentUser` の主要コストになっている

### 2.2 `/my` の初期表示は複数の重い取得を直列気味に抱えている

- `GET /my:requireCurrentUser`
  - 1.6 秒前後から 3.2 秒前後までばらつく
- `GET /my:getMonthShifts`
  - 約 1.0 秒
- `GET /my:getUnconfirmedShiftCount`
  - 約 1.0 秒
- `GET /my:getPayrollSummaryAmountForUser`
  - 約 1.5 秒
- `GET /my:total`
  - 約 3.1 秒

### 2.3 `/my/summary` も集計コストが大きい

- `GET /my/summary:requireCurrentUser`
  - 約 0.8 秒
- `GET /my/summary:getPayrollSummaryForUser`
  - 約 1.3 秒
- `GET /my/summary:total`
  - 約 2.1 秒

### 2.4 他画面は相対的に軽いが、共通の認証待ちが乗っている

- `GET /my/workplaces:total`
  - 約 0.6 秒
- `GET /my/shifts/confirm:getShiftConfirmationInitialData`
  - 約 0.7 秒

### 2.5 まとめ

今のボトルネックは、単一の重い SQL だけではない。

- `requireCurrentUser` を起点にした待ちが毎回乗る
- `/my` の初期取得が複数本あり、合計で体感を押し上げている
- 画面ごとの個別改善だけでは足りず、共通の入口を先に軽くする必要がある

## 3. 現在位置

直近で、`requireCurrentUser` の中で毎回発生していた email ベースの追加 user lookup は削減済みである。

そのため、このメモでいう「次にやること」は、`current-user:getSessionEmail:auth` 自体の追加計測と、`/my` 側の重い集計取得の軽量化である。

期待する効果は次の 2 点。

- `current-user:getSessionEmail:auth` が何に支配されているかを切り分けられるようにする
- `GET /my:getPayrollSummaryAmountForUser` を中心に、`/my` 初回表示の重さを認証方式変更なしで落とす

## 4. 何を先にやるか

### 優先順

1. `current-user:getSessionEmail:auth` の追加計測を入れて、重さの内訳を切り分ける
2. `GET /my:getPayrollSummaryAmountForUser` を軽量化する
3. `/my` の初期表示で必要なデータを分割し、重い取得を後ろに逃がす
4. `/my/summary` の集計を軽量化し、必要な情報だけ先に返す
5. その後で、ユーザー境界つきの安全な再利用を検討する

### 理由

- `current-user:getSessionEmail:auth` は最大で 3 秒超のばらつきがあり、現状の最上流ボトルネックである
- `GET /my:getPayrollSummaryAmountForUser` は `/my` の中で約 1.5 秒と大きく、認証方式を変えずに削れる可能性が高い
- `/my` と `/my/summary` の集計系は、認可を弱めずに用途別の軽量化を進めやすい
- 認証方式の変更や JWT 化の前に、追加計測と安全寄りの軽量化で取れる改善余地を先に取り切るべきである

## 5. 安全寄りの改善方針

### 5.1 先にやること

- `auth()` を置き換える前に、まず計測粒度を増やして支配要因を確定する
- `/my` の初期取得を「必須表示」と「後追いでよい情報」に分ける
- `getPayrollSummaryAmountForUser` は、amount 表示に必要な最小データだけ返す軽量経路を検討する
- `/my/summary` は、まず数値だけ返す軽量系を用意し、重い詳細は後段に回す
- 既存の認証・認可・所有権チェックは維持する

### 5.2 守ること

- ユーザー固有データを共有キャッシュへ載せない
- 認証情報や Google 連携状態を client session や cookie に安易に退避しない
- DB を正として、表示の都合で整合性を崩さない
- 失敗時に安全に戻せる変更を優先する
- `auth()` 相当の独自認証ロジックを先に導入しない

### 5.3 進め方の基準

- 1 回の変更で対象を広げすぎない
- まず `/my` と `/my/summary` を中心に扱う
- 効果が見えたら、他画面へ横展開する

## 6. まだやらないこと

- Google Calendar の逆同期
- 外部ジョブキューの導入
- 認可条件の短絡化
- cookie / session / JWT への可変状態の退避
- NextAuth / Auth.js の置き換え
- `auth()` の独自再実装
- 共有 CDN キャッシュへのユーザー固有レスポンス保存
- 大規模な画面再設計
- MVP 範囲を超える新機能追加

## 7. 次の担当者向けの具体的な作業手順

### Step 1: `auth()` の追加計測

1. `requireCurrentUser` を呼んでいる `/my` 系の画面と API を洗い出す
2. `current-user:getSessionEmail:auth` の内側を、少なくとも session 解決相当と user hydrate 相当に分けて計測する
3. 追加計測後も同じラベル体系で再比較できるようにする
4. ここでは認証方式を変えない

### Step 2: `GET /my:getPayrollSummaryAmountForUser` の軽量化

1. `getPayrollSummaryAmountForUser` が現在読んでいるデータ範囲を確認する
2. amount 表示に不要な読み取りを分離できるかを確認する
3. `/my` 専用に、次回支給額だけ返す軽量経路を検討する
4. 認可境界と支給月計算ルールを壊さないことを優先する

### Step 3: `/my` の必須データを減らす

1. `/my` 初期表示で本当に必要な値だけを残す
2. `getMonthShifts`、`getUnconfirmedShiftCount`、`getPayrollSummaryAmountForUser` の依存関係を整理する
3. 画面表示に必須でない値は、初回描画後に取得する形へ寄せる

### Step 4: `/my/summary` を軽量化する

1. `getPayrollSummaryForUser` の中で、初回に不要な集計を分離する
2. 先に出すべき値と、後から出してよい値を分ける
3. `/my/summary` の初期表示時間が短くなったかを再計測する

### Step 5: 安全な再利用を検討する

1. 同一リクエスト内で繰り返される処理を `cache` や共通関数に寄せる
2. 変更後の invalidation の漏れがないか確認する
3. ユーザー固有データの扱いに問題がないかを確認する

### Step 6: 再計測

1. 同じラベルで再計測する
2. `current-user:getSessionEmail:auth`、`GET /my:getPayrollSummaryAmountForUser`、`GET /my:total`、`GET /my/summary:total` を比較する
3. 体感改善が出ていなければ、次のボトルネックに進む

## 8. 期待する着地点

目標は、単に数値を下げることではない。

- `/my` の初回表示が詰まりにくいこと
- `current-user:getSessionEmail:auth` の待ちが説明できること
- `GET /my:getPayrollSummaryAmountForUser` を認証方式変更なしで削れること
- 追加の改善を入れる順番が、次の担当者にも明確であること

## 9. 補足

このメモは実装案ではなく、次に進む順番を決めるための作業方針である。

実装時は、変更前後で同じラベルを使って再計測すること。
