# シフト管理アプリ

## 開発計画書

---

# 1. プロジェクト概要

本プロジェクトは、**複数勤務先のシフト管理および概算給与集計を行う個人用Webアプリ**の開発を目的とする。

本アプリの特徴は以下である。

- 複数勤務先のシフトを一元管理
- 勤務先ごとの給与ルール履歴を管理
- 塾バイト特有の時間割シフトに対応
- Google Calendarと同期し、予定として表示
- 給与締め期間ベースの概算給与を算出

本アプリは **単一ユーザー専用** を前提とする。

---

# 2. 開発方針

本プロジェクトは以下の原則で開発する。

## 2.1 データの正

データの正は **アプリケーションDB** とする。

Google Calendar は

- 表示先
- 補助先

として扱う。

Google Calendar の予定編集は  
**アプリには反映しない。**

---

## 2.2 MVP（最小実装）

最初のバージョンでは以下のみ対応する。

### 対応

- シフト登録
- シフト編集
- 勤務先管理
- 給与ルール履歴管理
- 塾時間割設定
- 月カレンダー表示
- 給与締め期間集計
- Google Calendar 同期

### 非対応

- 控除計算
- 交通費
- 週単位残業
- 月60時間残業
- CSVエクスポート
- 複数ユーザー

---

# 3. 開発フェーズ

---

# Phase 1

## 要件定義・基本設計

成果物

- 開発計画書
- 設計書
- データモデル
- 技術選定

---

# Phase 2

## プロジェクト基盤構築

開発者が手動で構築する。

### 実施内容

- Next.js App Router 初期化
- TypeScript設定
- shadcn/ui導入
- Prisma導入
- DB接続
- 認証導入
- ディレクトリ構成整理
- 初期DBスキーマ作成
- seedデータ作成

---

# Phase 3

## 基本機能実装

主にCodexエージェントに依頼する。

### 実装タスク

| タスク | 内容                |
| ------ | ------------------- |
| T1     | Workplace CRUD      |
| T2     | PayrollRule CRUD    |
| T3     | Timetable CRUD      |
| T4     | Shift CRUD          |
| T5     | Calendar UI         |
| T6     | Shift登録フォーム   |
| T7     | 日別シフトモーダル  |
| T8     | 集計画面            |
| T9     | 給与計算ロジック    |
| T10    | Google Calendar同期 |

---

# Phase 4

## 機能統合

- カレンダーUIとシフト連携
- 給与計算の検証
- UI改善

---

# Phase 5

## 安定化

- バグ修正
- UI調整
- パフォーマンス確認

---

# 4. 技術スタック

## フロントエンド

- Next.js (App Router)
- TypeScript
- shadcn/ui

---

## 認証

Google OAuth

候補

- Auth0
- NextAuth

（実装時に決定）

---

## ORM

Prisma v6

---

## DB

PostgreSQL互換DB

候補

- PostgreSQL
- CockroachDB

---

## デプロイ

Vercel

---

## 外部連携

Google Calendar API

---

# 5. 開発ディレクトリ構成（案）

app/  
&nbsp;&nbsp;calendar/  
&nbsp;&nbsp;summary/  
&nbsp;&nbsp;workplaces/  
&nbsp;&nbsp;shifts/

components/  
&nbsp;&nbsp;calendar/  
&nbsp;&nbsp;shift/  
&nbsp;&nbsp;ui/

lib/  
&nbsp;&nbsp;db/  
&nbsp;&nbsp;payroll/  
&nbsp;&nbsp;calendar-sync/  
&nbsp;&nbsp;auth/

prisma/  
&nbsp;&nbsp;schema.prisma

---

# 6. Codex活用方針

Codexには **実装単位ごとのタスク** を依頼する。

例

- CRUD生成
- UI実装
- APIルート生成
- 集計ロジック生成
- テスト生成

設計責任は人間が保持する。
