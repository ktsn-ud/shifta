# パフォーマンス調査レポート（2026-04-13, セキュリティ優先版）

## 1. 目的

アクセス時の初回表示と、`/my` 配下のページ遷移で「画面が表示されるまで少し待つ」体感の原因を特定し、改善策を提示する。

本レポートでは、体感速度よりも認可・セッション・OAuth 関連情報の安全性を優先する。性能改善のために認可判定を短絡化したり、ユーザー固有状態を不適切にキャッシュしたりする案は採用しない。

## 2. 調査スコープと手法

- 対象: `app/`, `components/`, `hooks/`, `lib/`, `proxy.ts`, `next.config.ts`
- 手法:
  - Next.js MCP（`next-devtools`）でのランタイム確認
  - `pnpm next experimental-analyze --output` によるバンドル分析
  - 静的コード調査（待機箇所、`use client` 境界、重い依存、認可境界）
- 補足:
  - ブラウザ接続後の `get_errors` は `configErrors: [], sessionErrors: []`
  - `pnpm build` は環境依存（`lightningcss` ネイティブモジュール不足）で失敗したため、サイズ分析は `experimental-analyze` を使用

## 3. セキュリティ前提

改善案は以下を前提とする。

1. 認可の正は常にサーバー側に置く
2. `calendarId` やセットアップ完了状態を、cookie / session / JWT の追加値で権威化しない
3. ユーザー固有データのキャッシュは、共有キャッシュではなくユーザー境界付きのサーバー側キャッシュに限定する
4. 計測やログには email、token、`calendarId` などの機微情報を含めない

## 4. 結論サマリ

遅延は単一要因ではなく、以下の複合。

1. `Proxy` の認可コールバックで `/my` アクセス時に毎回 DB 参照が発生している
2. ダッシュボードの初期表示で「次月支給額」取得に重い年次集計関数を使っている
3. `/my` 配下のクライアント JS が全体に重く、特に `/my/summary` の負荷が大きい
4. `/my` レイアウト上位で認証待機しており、表示開始をブロックしやすい

セキュリティを最優先にすると、最も避けるべきなのは「`calendarId` 判定を cookie / session / JWT へ逃がして前段待機を消す」方針である。性能には効くが、認可に近い可変状態をクライアント近傍へ複製し、失効遅延や不整合を招きやすい。優先すべきなのは、`Proxy` の責務を絞り、DB を必要とする判定を信頼できるサーバー側コンポーネントへ移すことである。

## 5. 観測結果（エビデンス）

### 5.1 ランタイム状態（MCP）

- `get_errors`: エラーなし
- `get_page_metadata`（`/my`）:
  - `app/layout.tsx`
  - `app/my/layout.tsx`
  - `app/my/loading.tsx`
  - `app/my/page.tsx`

ランタイムエラー起因ではなく、設計上の待機・転送量が主因と判断。

### 5.2 バンドル分析（圧縮後クライアント JS）

`experimental-analyze` から抽出した主要ルートの合計:

- `/login`: 約 259.0 KiB
- `/my`: 約 401.6 KiB
- `/my/shifts/list`: 約 415.1 KiB
- `/my/shifts/new`: 約 439.0 KiB
- `/my/workplaces`: 約 499.2 KiB
- `/my/summary`: 約 569.7 KiB

`/my/summary` は `recharts` 関連チャンク（約 164 KiB）が追加されるため、遷移時の JS 取得・評価コストが大きい。

### 5.3 主要なボトルネック箇所

1. `Proxy` 内での DB 参照

- [lib/auth.ts](/workspace/lib/auth.ts:116)
  - `authorized` 内で `/my` 判定時に `prisma.user.findUnique` を実行し、`calendarId` を確認している
- [proxy.ts](/workspace/proxy.ts:1)
  - 広い matcher でページアクセス時にプロキシ処理が走る

2. ダッシュボードの重い集計呼び出し

- [app/my/page.tsx](/workspace/app/my/page.tsx:192)
  - `Promise.all` 内で `getPayrollSummaryForUser` を実行している
- [lib/payroll/summary.ts](/workspace/lib/payroll/summary.ts:153)
  - 年次 12 か月分を含む広い期間を集計している

3. 上位レイアウトでの待機

- [app/my/layout.tsx](/workspace/app/my/layout.tsx:18)
  - レイアウト先頭で `await requireCurrentUser()` を実行している

4. 重いクライアント依存の同梱

- [components/summary/summary-page-client.tsx](/workspace/components/summary/summary-page-client.tsx:4)
  - `recharts` を初期 import している
- [components/shifts/ShiftForm.tsx](/workspace/components/shifts/ShiftForm.tsx:482)
  - 初期化時に複数 API 取得が発生している

### 5.4 セキュリティ観点での注意点

- `calendarId` の有無は「ログイン済みユーザーが次に進める画面」を左右する可変状態であり、単なる UI ヒントではない
- この種の状態を cookie / session / JWT に複製すると、接続直後や解除直後に stale な値を参照するリスクがある
- したがって、性能改善のために認可境界をクライアント側へ寄せるのは不適切

## 6. 原因整理（セキュリティ優先）

### A. 認可境界の混在

- [lib/auth.ts](/workspace/lib/auth.ts:116) の `authorized` は、本来の認証チェックに加えて「Google Calendar セットアップ完了確認」まで担っている
- セットアップ完了確認は DB 依存の可変状態であり、ここを高速化するためにクライアント近傍へキャッシュすると安全性が落ちる

### B. サーバー待機

- ダッシュボードが必要以上に重い集計を初期表示で実行している
- この問題は認可ロジックを弱めずに解消できるため、優先度が高い

### C. バンドルサイズ

- `/my` 共通領域でベース JS 量が大きく、初回表示と遷移の体感に影響している
- チャート遅延読込は認可やデータ境界を変えないため、安全に進めやすい

### D. キャッシュ設計

- 今後 `use cache` やメモ化を導入する場合、ユーザー固有レスポンスを共有キャッシュへ載せないことが前提になる
- とくに集計・認証状態・Google 連携状態は、ユーザー境界と invalidation 戦略がないままキャッシュしてはいけない

## 7. 改善提案（優先順位）

### P0（先に実施）

1. `Proxy` の責務を絞り、DB 必須判定をサーバー側へ移す

- `Proxy` では「未ログインなら `/login`、ログイン済みで `/login` に来たら `/my`」までに責務を限定する
- `calendarId` に基づくセットアップ完了確認は、`/my` 配下のサーバーコンポーネントまたは専用ガードへ移し、`requireCurrentUser()` 後に DB 参照する
- これにより認可の正をサーバーに残したまま、ナビゲーション前段の待機を減らせる
- 非推奨: `calendarId` や setup 完了フラグを cookie / session / JWT に保存して判定に使うこと

2. ダッシュボード用の軽量集計を分離する

- `nextMonthPaymentAmount` 用に「対象月の `totalWage` のみ」を返す軽量関数またはクエリを作る
- [app/my/page.tsx](/workspace/app/my/page.tsx:192) の初期表示では年次集計を呼ばず、`getPayrollSummaryForUser` は `/my/summary` 専用へ寄せる
- 認可条件は現状のまま維持し、クエリ対象を減らすことで待機を削減する

3. `/my/summary` のチャートを遅延読み込みする

- `recharts` 使用部分を `next/dynamic` で分離し、先に数値カードと表を表示する
- この変更はデータ境界を変えず、クライアント転送量だけを下げられる

### P1（次段）

1. 認証後の表示を段階化する

- 認証そのものは早い段階で維持しつつ、重いデータ取得は下位コンポーネントへ移して `Suspense` で段階描画する
- 認可前に機微データを読み始めない構造を守る

2. フォーム初期化のウォーターフォールを削減する

- `ShiftForm` の初期データ取得を見直す
- 統合 API を作る場合も、返却項目は最小限にし、既存のアクセス制御を崩さない

3. `proxy.ts` の matcher を監査前提で見直す

- 性能だけを見るなら matcher を狭める余地はある
- ただし保護対象ルートの漏れはそのままセキュリティ事故になるため、ルート棚卸し後に実施する

### P2（中長期）

1. Cache Components を private 前提で段階導入する

- 更新頻度が低い集計や一覧には効果がある
- ただし共有キャッシュではなく、ユーザー境界付きの private キャッシュ、または明示的なサーバー側キャッシュに限定する
- シフト、勤務先、給与ルール、Google Calendar 設定変更時の invalidation を先に定義する
- 認証状態、token、`calendarId` のような可変認可情報はキャッシュ対象にしない

2. 継続計測を整備する

- `Server-Timing` で `auth/db/summary` を分解し、P50/P95 を追跡する
- 計測値やログには email、token、`calendarId` を含めない

## 8. 非推奨の改善案

以下は体感速度に効く可能性があっても、本件では採用しない。

1. `calendarId` やセットアップ完了フラグを cookie / session / JWT に保存して認可判定に使う
2. 認証済み HTML / RSC をユーザー境界なしで共有キャッシュする
3. 計測やデバッグログへ email、token、`calendarId` を出す
4. 保護ルートの監査なしに `proxy.ts` の matcher を狭める

## 9. 実施順（推奨）

1. `Proxy` からセットアップ完了判定を外し、サーバー側ガードへ移す
2. ダッシュボード集計を軽量化する
3. `/my/summary` のチャートを遅延読込にする
4. 認証後の段階描画へ整理する
5. private 前提のキャッシュと継続計測を追加する

この順であれば、認可境界を崩さずに体感改善を積み上げやすい。

## 10. 期待効果（目安）

- P0 実施後:
  - `/my` 系遷移の前段待機を減らしやすい
  - `/my/summary` の初期表示を高速化しやすい
  - 認可情報の stale cache リスクを持ち込まずに済む
- P1 以降:
  - ルート間での表示時間のばらつきを抑制しやすい
  - データ量増加時の劣化を抑えつつ、ユーザー境界を維持しやすい

## 11. 参照ドキュメント

- Prefetching
  - https://nextjs.org/docs/app/guides/prefetching
- Lazy Loading
  - https://nextjs.org/docs/app/guides/lazy-loading
- Package Bundling
  - https://nextjs.org/docs/app/guides/package-bundling
- Streaming
  - https://nextjs.org/docs/app/guides/streaming
- use cache
  - https://nextjs.org/docs/app/api-reference/directives/use-cache
- Caching
  - https://nextjs.org/docs/app/getting-started/caching
- Link Component
  - https://nextjs.org/docs/app/api-reference/components/link
