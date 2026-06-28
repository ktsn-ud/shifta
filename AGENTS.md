# AGENTS.md

## 目的

このリポジトリで作業するエージェントと人間が、同じ前提・制約・品質基準で開発できるようにする。

## プロジェクト概要

- 個人用のシフト管理・概算給与管理 Web アプリ。
- 複数勤務先、給与ルール履歴、塾の時間割シフトを扱う。
- Google Calendar と同期するが、データの正はアプリケーション DB。
- Google Calendar 側で編集された内容は、アプリへ逆同期しない。

## 開発原則

- データの正はアプリケーション DB とする。
- Google Calendar は表示・補助・外部カレンダー連携用途として扱う。
- MVP 範囲を優先し、控除・交通費・複数ユーザーなど未定義の拡張要件は先に追加しない。
- 設計責任は人間が持ち、エージェントは実装単位で支援する。
- 変更は最小差分で行い、無関係なリファクタを混ぜない。
- 既存の設計・命名・ディレクトリ方針を優先する。
- 仕様が曖昧な場合は、前提を明記して小さく進める。大きな判断が必要な場合は実装前に確認する。

## 技術スタック

- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- ESLint 9 + eslint-config-next
- Prettier
- Prisma

## 標準フロー

非自明な実装では、以下の順で進める。

1. Plan mode で方針を整理する。
2. 必要に応じて `code_researcher` で既存コードを調査する。
3. `implementer` が最小差分で実装する。
4. `test_writer` が必要なテストを追加・更新する。
5. `tester` が format / typecheck / lint / test を実行する。
6. `reviewer` が diff を確認する。
7. 必要に応じて `security_reviewer` が確認する。
8. 検証とレビューで重大な問題がなければ、そのタスクを自動でコミットする。
9. 次のタスクに進む。

検証失敗、重大なレビュー指摘、仕様判断が必要な場合は、コミットせずに停止して報告する。

小さな文言修正や明らかな typo 修正では、Plan mode を省略してよい。

## サブエージェント運用

ユーザーが明示的にサブエージェント名を指定しなくても、非自明な作業では以下の標準フローを使う。

1. Plan mode で目的・関連ファイル・現在の挙動・実装方針・テスト方針・リスクを整理する。
2. 既存コード調査が必要な場合は `code_researcher` を使う。
3. Plan が固まったら `implementer` で最小差分の実装を行う。
4. 振る舞いが変わる場合、バグ修正、境界値が重要な場合は `test_writer` を使う。
5. 実装後は `tester` で format / typecheck / lint / test を実行する。
6. 実装後の diff は `reviewer` で確認する。
7. 認証・認可・API・DB・Google Calendar 連携・Cookie・Token・API key・環境変数・個人情報・勤務先情報・給与情報が絡む場合は `security_reviewer` も使う。

軽微な typo、文言修正、コメント修正、振る舞いを変えない小さな UI 修正では、サブエージェントを省略してよい。

各サブエージェントの詳細な責務は `.codex/agents/*.toml` に従う。

### 省略してよい場合

以下のような小変更では、サブエージェントを省略してよい。

- typo 修正
- コメント修正
- README の軽微な文言修正
- 明らかな import 整理
- 振る舞いを変えない小さな UI 文言修正

### 迷った場合

- 実装する前に `code_researcher` を使う。
- 実装後に `tester` と `reviewer` を使う。
- セキュリティ・個人情報・給与情報に関係する可能性があるなら `security_reviewer` を使う。

## 実行コマンド

使用するパッケージマネージャは `pnpm` とする。

- 開発: `pnpm dev`
- ビルド: `pnpm build`
- 本番起動: `pnpm start`
- 型チェック: `pnpm exec tsc --noEmit`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Test: `pnpm test`

コマンドが存在しない場合は、`package.json` や README を確認し、利用可能なコマンドを報告する。存在しない script を勝手に追加しない。

## MCP 活用方針

- Next.js 関連タスクでは `next-devtools` を優先して利用する。
- Next.js の調査・実装時は、可能であれば `next-devtools` の `init` と `nextjs_index` を実行し、利用可能ツールとサーバー状態を把握する。
- ルート・エラー・ビルド状態の確認は `nextjs_call` を優先する。
- UI コンポーネント追加・調査では、必要に応じて `shadcn` MCP を利用する。
- MCP が利用不可、または情報不足の場合のみ、ローカル調査や通常コマンドにフォールバックする。

## ディレクトリ方針

- UI ルート: `app/`
- 想定機能ルート: `app/calendar`, `app/summary`, `app/workplaces`, `app/shifts`
- 共通コンポーネント: `components/`
- 業務ロジック: `lib/`
- 給与計算ロジック: `lib/payroll`
- Google Calendar 同期ロジック: `lib/calendar-sync`
- 認証・認可ロジック: `lib/auth`
- DB スキーマ: `prisma/schema.prisma`
- 設計ドキュメント: `docs/`

画面ロジックと業務ロジックは分離する。計算処理・同期処理・バリデーションなどは、可能な限り `lib/` に置く。

## 設計ドキュメント

実装前に `docs/DESIGN_SPECIFICATION.md` を確認する。

特に以下を確認する。

- 実装対象の画面 ID
- URL 構造
- 関連するドメインモデル
- バリデーション仕様
- エラー処理
- 給与計算ロジック
- Google Calendar 同期仕様

仕様変更を行う場合は、必要に応じて `docs/DESIGN_SPECIFICATION.md` も更新し、更新履歴に追記する。

## 実装ガイドライン

- TypeScript の `any` は原則使わない。
- 型安全を優先する。
- import は `@/*` エイリアスを優先する。
- UI と業務ロジックを分離する。
- 公開 API や既存の振る舞いを変更する場合は、理由を明記する。
- 未使用コードや dead code の削除は、今回の作業と直接関係する場合のみ行う。
- 依存追加、設定変更、ディレクトリ再編、大規模リファクタは明示指示なしに行わない。

## Prisma / DB 操作

エージェントが実行してよい Prisma 系コマンドは以下のみ。

- `pnpm prisma generate`

以下はエージェント判断で実行しない。

- `pnpm prisma migrate dev`
- `pnpm prisma migrate deploy`
- `pnpm prisma db push`
- `pnpm prisma db seed`
- DB のデータ削除・リセットを伴うコマンド

migration ファイルの作成や DB 状態を変更する操作が必要な場合は、実装を止めてユーザーに確認する。

`pnpm prisma generate` が必要な場合はエージェントが実行してよい。ただし、エージェント環境とユーザー環境は異なるため、必要に応じてユーザーにも実行を依頼する。

## 依存関係と開発サーバー

- Codex 起動直後や依存関係変更後は、必要に応じてエージェント側で `pnpm install` を実行してよい。
- `pnpm add`, `pnpm remove`, `pnpm update` はエージェント判断で実行しない。
- 依存追加・削除・更新が必要な場合は、実装を止めてユーザーに確認する。
- `pnpm dev` はエージェント判断で実行しない。必要な場合はユーザーに依頼する。

## 検証方針

コードベースに触れる実装では、原則として以下を実行する。

- `pnpm format`
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm test`

必要に応じて以下も実行する。

- `pnpm build`

ドキュメントのみの変更では、型チェック・Lint・テストは省略してよい。ただし、可能なら `pnpm format` を実行する。

検証コマンドが失敗した場合は、以下を報告する。

- 実行したコマンド
- 失敗内容
- 原因候補
- 次に確認すべきファイル・箇所

## Formatting policy

- 既存の formatter を使う。
- formatting-only の変更は許可する。
- formatter 設定は明示指示なしに変更しない。
- `lint --fix` は明示指示がある場合のみ実行する。lint fix は意味に触れる可能性があるため。
- 
## Git 運用

- 実装を伴う依頼では、作業を適切なタスク単位に分割する。
- 各タスクは「1目的 + 1検証単位」とする。
- 各タスクごとに、実装・テスト追加・整形・検証・レビューを行い、問題がなければ自動でコミットしてよい。
- コミット前に、原則として以下を実行する。
  - `pnpm format`
  - `pnpm exec tsc --noEmit`
  - `pnpm lint`
  - `pnpm test`
- 必要に応じて `pnpm build` も実行する。
- 検証に失敗した場合はコミットしない。
- `reviewer` または `security_reviewer` が Critical / Major な問題を指摘した場合はコミットしない。
- ドキュメントのみの変更では、型チェック・Lint・テストは省略してよい。ただし可能なら `pnpm format` を実行する。
- ユーザーから明示的に禁止されていない限り、完了したタスクは自動でコミットしてよい。
- push はユーザーから明示指示がある場合のみ行う。
- エージェント判断でリモートへ push することは禁止。
- 破壊的な Git 操作は禁止。
- 既存の未関連変更を巻き戻さない。

コミットする場合は、1 コミットを「1 目的 + 1 検証単位」とする。

コミットメッセージは conventional commits 原則で **日本語で** 書く。

形式:

```text
feat: 〇〇

- 変更内容
- 変更理由
- 互換性や影響範囲
```

## 禁止事項

- 無関係な変更を混ぜること
- 未関連の差分を巻き戻すこと
- 破壊的操作を無断で行うこと
- DB データを削除・リセットすること
- 依存関係を無断で追加・削除・更新すること
- secret, `.env*`, token, API key を編集・表示・ログ出力すること
- generated file や lockfile を理由なく編集すること
- 仕様未定義の拡張要件を先回りして実装すること
- テストを弱めて通すこと
- `lint --fix` を明示指示なしに実行すること
- リモートへ push すること

## 完了時の報告

作業完了時は以下を簡潔に報告する。

- 変更したファイル
- 実装・変更した内容
- 実行した検証コマンド
- 検証結果
- 仕様との差分や未完了事項
- 必要に応じて、ユーザー側で実行すべきコマンド
