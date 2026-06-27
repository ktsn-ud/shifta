# API Reference

本アプリの API は Next.js App Router の Route Handler で実装されています。

- Base: `/api`
- 認証: NextAuth セッション必須（`/api/auth/*` を除く）
- レスポンス形式: 成功時 `data` または `success`、失敗時 `error`
- 予定 API は、設計済みだが未実装のエンドポイントとして明記する

## Auth

| Method     | Path                      | 概要                    |
| ---------- | ------------------------- | ----------------------- |
| `GET/POST` | `/api/auth/[...nextauth]` | NextAuth エンドポイント |

## Users

| Method | Path            | 概要                              |
| ------ | --------------- | --------------------------------- |
| `POST` | `/api/users`    | 現在ログイン中ユーザーの作成/更新 |
| `GET`  | `/api/users/me` | 自分のユーザー情報取得            |
| `PUT`  | `/api/users/me` | 自分のユーザー情報更新            |

## Workplaces

| Method   | Path                           | 概要                                     |
| -------- | ------------------------------ | ---------------------------------------- |
| `GET`    | `/api/workplaces`              | 勤務先一覧取得                           |
| `POST`   | `/api/workplaces`              | 勤務先作成（初期給与ルール同時作成対応） |
| `GET`    | `/api/workplaces/:workplaceId` | 勤務先詳細取得                           |
| `PUT`    | `/api/workplaces/:workplaceId` | 勤務先更新                               |
| `DELETE` | `/api/workplaces/:workplaceId` | 勤務先削除（関連データも削除）           |

## Payroll Rules

| Method   | Path                                             | 概要           |
| -------- | ------------------------------------------------ | -------------- |
| `GET`    | `/api/workplaces/:workplaceId/payroll-rules`     | 給与ルール一覧 |
| `POST`   | `/api/workplaces/:workplaceId/payroll-rules`     | 給与ルール作成 |
| `GET`    | `/api/workplaces/:workplaceId/payroll-rules/:id` | 給与ルール詳細 |
| `PUT`    | `/api/workplaces/:workplaceId/payroll-rules/:id` | 給与ルール更新 |
| `DELETE` | `/api/workplaces/:workplaceId/payroll-rules/:id` | 給与ルール削除 |

## Timetables

| Method   | Path                                          | 概要                             |
| -------- | --------------------------------------------- | -------------------------------- |
| `GET`    | `/api/workplaces/:workplaceId/timetables`     | 時間割一覧                       |
| `POST`   | `/api/workplaces/:workplaceId/timetables`     | 時間割作成（複数件一括作成対応） |
| `PUT`    | `/api/workplaces/:workplaceId/timetables/:id` | 時間割更新                       |
| `DELETE` | `/api/workplaces/:workplaceId/timetables/:id` | 時間割削除                       |

## Shifts

| Method   | Path                          | 概要                                       |
| -------- | ----------------------------- | ------------------------------------------ |
| `GET`    | `/api/shifts`                 | シフト一覧取得（期間・勤務先フィルタ対応） |
| `POST`   | `/api/shifts`                 | シフト作成（Google 同期含む）              |
| `POST`   | `/api/shifts/bulk`            | シフト一括作成                             |
| `GET`    | `/api/shifts/:id`             | シフト詳細取得                             |
| `PUT`    | `/api/shifts/:id`             | シフト更新                                 |
| `DELETE` | `/api/shifts/:id`             | シフト削除                                 |
| `GET`    | `/api/shifts/:id/sync-status` | Google 同期状態取得                        |
| `POST`   | `/api/shifts/:id/retry-sync`  | Google 同期再試行                          |

## Payroll Summary

| Method | Path                   | 概要                                      |
| ------ | ---------------------- | ----------------------------------------- |
| `GET`  | `/api/payroll/summary` | 期間内給与集計（勤務時間/勤務先内訳含む） |

主なクエリパラメータ:

- `month` (`YYYY-MM`)
  - 支給月を指定する。
  - 例: `2026-06`

## Payroll Preview

シフト登録画面で、入力中の未保存シフトを反映した支給月別プレビューを表示するための軽量 baseline API。

| Method | Path                            | 概要                                           |
| ------ | ------------------------------- | ---------------------------------------------- |
| `GET`  | `/api/payroll/preview-baseline` | 支給月ごとの既存支給見込を取得（プレビュー用） |

主なクエリパラメータ:

- `months` (`YYYY-MM,YYYY-MM`)
  - 取得対象の支給月をカンマ区切りで指定する
  - 例: `2026-06,2026-07`

レスポンス主要項目:

```ts
type PayrollPreviewBaselineResponse = {
  data: {
    months: {
      month: string;
      totalWage: number;
      byWorkplace: {
        workplaceId: string;
        wage: number;
        periodStartDate: string;
        periodEndDate: string;
      }[];
    }[];
  };
};
```

仕様:

- 認証済みユーザーの DB 保存済みシフトだけを対象にする。
- 未確定シフトも含める。
- Google Calendar 側の予定は含めない。
- 入力中の未保存シフト分は API では計算せず、クライアント側で差分計算する。
- 不正な `months` は `400` を返す。

## Google Calendar

| Route                | 概要                                                          |
| -------------------- | ------------------------------------------------------------- |
| `/my/calendar-setup` | Google Calendar 初期設定画面。`calendarId` 未設定時の専用導線 |

| Method | Path                       | 概要                                           |
| ------ | -------------------------- | ---------------------------------------------- |
| `POST` | `/api/calendar/initialize` | Google Calendar 初期設定（専用カレンダー作成） |

## エラーコードの目安

- `400`: バリデーションエラー
- `401`: 未認証
- `403`: 権限不足
- `404`: 対象データなし
- `409`: 競合（既存設定あり等）
- `500+`: サーバー/外部 API エラー
