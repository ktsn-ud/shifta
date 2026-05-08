# Shifta

個人向けのシフト管理・概算給与管理 Web アプリです。  
**アプリケーション DB を正とし、Google Calendar とは片方向同期**を行います。

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
- TanStack Query
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

### 3. 依存関係と Prisma Client の準備

```bash
pnpm install
pnpm prisma generate
```

### 4. 開発起動

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
- `/my/calendar-setup` Google Calendar 連携設定
- `/my/shifts/new` シフト入力
- `/my/shifts/list` シフト一覧
- `/my/shifts/bulk` シフト一括入力
- `/my/shifts/confirm` シフト確定
- `/my/summary` 給与集計
- `/my/payroll-details` 給与詳細（勤務先別・月別）
- `/my/workplaces` 勤務先管理
- `/my/settings` 設定

## API ドキュメント

API の一覧は [API_REFERENCE.md](docs/API_REFERENCE.md) を参照してください。

## 設計・開発ドキュメント

- 統合設計書（ベース）: [DESIGN_SPECIFICATION.md](docs/DESIGN_SPECIFICATION.md)
- 支給月基準集計の仕様: `DESIGN_SPECIFICATION.md` の 13章
- 給与詳細画面の仕様: `DESIGN_SPECIFICATION.md` の 14章
- 給与計算ロジック正本: [PAYROLL_CALCULATION_SPEC_V2_20260430.md](docs/PAYROLL_CALCULATION_SPEC_V2_20260430.md)
- 開発ガイド: [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)
- 初期実装タスク（アーカイブ）: [legacy_initial-implementation-tasks.md](docs/archive/implementation/legacy_initial-implementation-tasks.md)

## 補足

- データの正はアプリケーション DB です。
- Google Calendar 側の編集はアプリへ逆同期しません。
