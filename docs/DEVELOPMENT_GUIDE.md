# Development Guide

このドキュメントは、Shifta の日常開発フローをまとめたものです。

## 1. 実装前チェック

1. `docs/IMPLEMENTATION_TASKS.md` で対象タスクを確認
2. `docs/DESIGN_SPECIFICATION.md` で仕様を確認
3. 仕様差分がある場合は `IMPLEMENTATION_TASKS.md` を優先

## 2. 実装ポリシー

- TypeScript strict を維持し、`any` は原則使わない
- 画面ロジックと業務ロジックを分離する
- 無関係なリファクタを混ぜない（最小差分）
- データの正はアプリ DB（Google Calendar は補助）

## 3. 推奨開発サイクル

1. 実装
2. 型チェック: `pnpm exec tsc --noEmit`
3. Lint: `pnpm lint`
4. 整形: `pnpm format`
5. 変更確認とコミット

## 4. Next.js ランタイム確認

Next.js 関連の修正では、実装前後に `next-devtools` を使って確認します。

- `init`: MCP 初期化
- `nextjs_index`: 稼働サーバー検出
- `nextjs_call get_errors`: ランタイムエラー確認
- `nextjs_call get_routes`: ルーティング確認

## 5. テスト方針

- ユニット: `lib/payroll/__tests__/*`
- 統合（UIフロー）: `components/**/__tests__/*`
- 重要フローは回帰テストを追加してからマージする

## 6. Prisma 運用

DB スキーマ変更時は以下を実施します。

- `prisma generate`
- `prisma migrate dev`

マイグレーションファイルはスキーマ変更と同じ文脈で管理してください。

## 7. コミット規約（要点）

- 形式: `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`, `perf: ...`
- 実装タスクはタスク番号を含める（例: `feat: T12-3 ...`）
- 件名は日本語で「何を・なぜ」を要約する
- 本文は箇条書きで変更意図を記載する

## 8. 参考ドキュメント

- 仕様: [DESIGN_SPECIFICATION.md](./DESIGN_SPECIFICATION.md)
- タスク分割: [IMPLEMENTATION_TASKS.md](./IMPLEMENTATION_TASKS.md)
- API: [API_REFERENCE.md](./API_REFERENCE.md)
