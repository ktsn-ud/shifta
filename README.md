# Shifta

個人向けのシフト管理・概算給与管理 Web アプリです。

- 複数勤務先の管理
- シフト登録（通常 / 授業 / その他）
- 塾勤務先向けの時間割・コマ範囲管理
- 期間別の給与集計
- Google Calendar 同期（アプリ DB を正とする片方向同期）

## 技術スタック

- Next.js 16 (App Router)
- React 19
- TypeScript (strict)
- Prisma + PostgreSQL (Neon)
- NextAuth (Google)
- Tailwind CSS 4
- ESLint / Prettier / Jest

## セットアップ

### 1. 前提

- Node.js 20+
- pnpm
- PostgreSQL 互換 DB（Neon 推奨）
- Google OAuth クライアント（Calendar 同期を使う場合）

### 2. 環境変数

`.env` を作成し、最低限以下を設定してください。

```env
DATABASE_URL=
DIRECT_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

Google Calendar 同期を利用する場合、Google OAuth 側で Calendar へのアクセス権限を付与してください。

### 3. 開発起動

```bash
pnpm dev
```

## 開発コマンド

```bash
pnpm dev                  # 開発サーバー
pnpm build                # 本番ビルド
pnpm start                # 本番起動
pnpm exec tsc --noEmit    # 型チェック
pnpm lint                 # Lint
pnpm format               # 整形
pnpm test                 # Jest テスト
```

## 主要ルート

- `/login` ログイン
- `/my` ダッシュボード
- `/my/shifts/new` シフト入力
- `/my/shifts/bulk` シフト一括入力
- `/my/summary` 給与集計
- `/my/workplaces` 勤務先管理

## API ドキュメント

API の一覧は [API_REFERENCE.md](docs/API_REFERENCE.md) を参照してください。

## 開発ドキュメント

- 要件・仕様: [DESIGN_SPECIFICATION.md](docs/DESIGN_SPECIFICATION.md)
- 実装タスク: [IMPLEMENTATION_TASKS.md](docs/IMPLEMENTATION_TASKS.md)
- 開発ガイド: [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)

## 補足

- データの正はアプリケーション DB です。
- Google Calendar 側の編集はアプリへ逆同期しません。
