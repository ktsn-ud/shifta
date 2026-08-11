# AGENTS.md

## 目的

このリポジトリで作業するエージェントと人間が、同じ前提・制約・品質基準で開発できるようにする。

詳細な実行責務は `.codex/agents/*.toml` に分けて管理する。このファイルには、全員が最初に共有すべき前提と、司令塔を含む運用ルールだけを置く。

## プロジェクト前提

- 個人用のシフト管理・概算給与管理 Web アプリ。
- 複数勤務先、給与ルール履歴、塾の時間割シフトを扱う。
- データの正はアプリケーション DB。Google Calendar は表示・補助・外部カレンダー連携用途であり、Google Calendar 側の編集はアプリへ逆同期しない。
- MVP 範囲を優先し、控除・交通費・複数ユーザーなど未定義の拡張要件は先に追加しない。
- 設計責任は人間が持ち、エージェントは実装単位で支援する。

## 技術スタック

- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- ESLint 9 + eslint-config-next
- Prettier
- Prisma

## オーケストレーション原則

- `Main` は司令塔であり、目的整理、Plan mode、委譲判断、結果統合、最終報告を担当する。
- `Main` は、ファイル探索・既存実装の読解・類似実装の検索・広範な差分や設定内容の取得を、`code_researcher` に委譲する。`rg`、`sed`、`find`、`cat`、`git grep` など高出力となり得るコマンドを直接実行しない。
- `Main` が直接実行してよいのは、`git status` など対象・出力とも明らかに少量の状態確認のみとする。判断に迷う場合は `code_researcher` に委譲する。
- 非自明なタスクでは、`Main` が調査・実装・テスト追加・検証・レビューを自前で完結させない。
- `Main` は必要なサブエージェントを選び、各役割の責務を混ぜない。
- サブエージェントは単機能で動かし、担当外の作業は次工程へ handoff する。
- 速度とコストは、まず不要なサブエージェント起動を減らすことで改善する。モデル変更や役割統合は、責務境界を崩さない範囲でのみ検討する。

## 標準フロー

非自明な実装では、Plan mode で目的・関連ファイル・現在の挙動・実装方針・テスト方針・リスクを整理し、原則として次の順で進める。

1. `code_researcher`（`.codex/agents/code-researcher.toml`）で既存コードと仕様の調査
2. `Main` で計画確定
3. 内容がほぼ確定した狭く局所的な実装は `implementer_lite`（`.codex/agents/implementer-lite.toml`）、曖昧さ・複数箇所横断・設計判断・セキュリティ/データ整合性リスクがある実装は `implementer`（`.codex/agents/implementer.toml`）で最小差分実装
4. `test_writer`（`.codex/agents/test-writer.toml`）で必要なテスト追加・更新
5. `tester`（`.codex/agents/tester.toml`）で `format` / `typecheck` / `lint` / `test` などの検証
6. `reviewer`（`.codex/agents/reviewer.toml`）で correctness / regression / maintainability レビュー
7. 必要な場合のみ `security_reviewer`（`.codex/agents/security-reviewer.toml`）と `docs_writer`（`.codex/agents/docs-writer.toml`）

`reviewer` または `security_reviewer` のレビュー後、`Main` は具体的な修正内容が明確な指摘を `implementer_lite` に渡す。修正範囲が広い、または実装上の判断を要する場合は `implementer` に渡す。

`tester` の検証が失敗した後も、失敗原因と修正内容が明確で局所的な場合は `implementer_lite` に渡す。原因調査が必要な場合は、必要に応じて修正前に `code_researcher` を使い、修正範囲が広い、または実装上の判断を要する場合は `implementer` に渡す。

### サブエージェント起動基準

| Agent               | 使う場面                                                                                                                             | やらないこと                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `code_researcher`   | 非自明な既存挙動確認、関連ファイル特定、類似実装調査                                                                                 | 実装、検証、レビュー確定                                       |
| `implementer_lite`  | 内容がほぼ確定し、狭く局所的な実装のみ。曖昧さ・複数箇所横断・設計判断・セキュリティ/データ整合性リスクがあれば `implementer` を使う | テスト実行、Lint/型チェック実行、レビュー、docs 判断の抱え込み |
| `implementer`       | Plan 確定後、実装上の判断を要する本実装。曖昧さ・複数箇所横断・設計判断・セキュリティ/データ整合性リスクを伴う変更                   | テスト実行、Lint/型チェック実行、レビュー、docs 判断の抱え込み |
| `test_writer`       | 振る舞い変更、バグ修正、境界値、回帰防止が必要                                                                                       | 本番コードの修正、検証コマンド実行                             |
| `tester`            | 実装後の formatter / typecheck / lint / test / build 実行                                                                            | 検証失敗の修正、設計変更、レビュー                             |
| `reviewer`          | 実装と検証結果が揃った後の差分レビュー                                                                                               | 実装、検証代行、進行管理                                       |
| `security_reviewer` | 認証・認可・API・DB・Google Calendar 連携・Cookie・Token・API key・環境変数・個人情報・勤務先情報・給与情報が絡む変更                | 一般レビューの重複、実装                                       |
| `docs_writer`       | README、設計仕様、セットアップ手順などの更新が必要                                                                                   | アプリコード修正、不要な docs 作成                             |

### 省略可能なケース

- 軽微な typo、コメント修正、README の軽微な文言修正、明らかな import 整理、振る舞いを変えない小さな UI 文言修正では、Plan mode や一部サブエージェントを省略してよい。
- 省略できるのは軽微ケースだけであり、非自明なタスクで `Main` が自前完結する理由にはしない。
- 迷った場合は、実装前に `code_researcher`、実装後に `tester` と `reviewer` を使う。

## 作業ルール

- 変更は最小差分で行い、無関係なリファクタや未関連差分の巻き戻しを混ぜない。
- 既存の設計・命名・ディレクトリ方針を優先する。
- 仕様が曖昧な場合は前提を明記して小さく進める。大きな判断が必要な場合は実装前に確認する。
- TypeScript の `any` は原則使わず、型安全を優先する。
- import は `@/*` エイリアスを優先する。
- UI と業務ロジックを分離し、計算処理・同期処理・バリデーションは可能な限り `lib/` に置く。
- secret、`.env*`、token、API key を編集・表示・ログ出力しない。
- 依存追加・削除・更新、設定変更、ディレクトリ再編、大規模リファクタは明示指示なしに行わない。
- Codex 起動直後や依存関係変更後は、必要に応じて `pnpm install` を実行してよい。ただし `pnpm add`、`pnpm remove`、`pnpm update` はエージェント判断で実行しない。
- Prisma でエージェント判断で実行してよいのは `pnpm prisma generate` のみ。migration 作成や DB 状態変更が必要な場合は停止して確認する。
- `pnpm dev`、DB のデータ削除・リセット、破壊的 Git 操作、リモートへの push はエージェント判断で実行しない。

## 主要パス

- UI ルート: `app/`
- 想定機能ルート: `app/calendar`, `app/summary`, `app/workplaces`, `app/shifts`
- 共通コンポーネント: `components/`
- 業務ロジック: `lib/`
- 給与計算ロジック: `lib/payroll`
- Google Calendar 同期ロジック: `lib/calendar-sync`
- 認証・認可ロジック: `lib/auth`
- DB スキーマ: `prisma/schema.prisma`
- 設計ドキュメント: `docs/`

実装前に `docs/DESIGN_SPECIFICATION.md` を確認する。仕様変更を行う場合は、必要に応じて同ファイルも更新し、更新履歴に追記する。

## コマンド

使用するパッケージマネージャは `pnpm`。

- 開発: `pnpm dev`
- ビルド: `pnpm build`
- 本番起動: `pnpm start`
- 型チェック: `pnpm exec tsc --noEmit`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Test: `pnpm test`

コードベースに触れる実装では、原則として `tester` が `pnpm format`、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm test` を実行する。ドキュメントのみの変更では型チェック・Lint・テストを省略してよいが、可能なら `pnpm format` を実行する。

## Git 運用

- 検証失敗、仕様判断が必要な未解決事項、`reviewer` / `security_reviewer` の Critical または Major 指摘がある場合はコミットしない。
- 問題がなければ、ユーザーから明示的に禁止されていない限り、完了したタスクは自動でコミットしてよい。
- 1 コミットは「1目的 + 1検証単位」とする。
- コミットメッセージは conventional commits 原則で日本語で書く。

```text
feat: 〇〇

- 変更内容
- 変更理由
- 互換性や影響範囲
```

## 完了報告

作業完了時は、変更したファイル、変更内容、実行した検証コマンド、検証結果、仕様との差分や未完了事項、必要に応じてユーザー側で実行すべきコマンドを簡潔に報告する。
