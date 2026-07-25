# 勤務先参照の長寿命キャッシュと即時整合性方針（2026-07-25）

## 1. 目的と適用範囲

勤務先・給与ルール・時間割の参照を長寿命 Server Cache へ寄せつつ、更新直後の画面と給与計算が古い値を使わないための実装方針を記録する。本書は実装計画であり、未実装の動作を現行仕様として扱わない。DB は正本で、Google Calendar は表示・外部連携に限る。

## 2. 現行コードの確認結果

- `lib/cache/workplace-read-cache.ts` は `use cache`、ユーザー/勤務先単位の `cacheTag` を使い、勤務先一覧、詳細、給与ルール、時間割セットを DTO として返す。現行の各 cached DAL 関数には、対象に応じた user/workplace/rule/timetable タグを付与する。
- `lib/cache/tags.ts` は `user:*:workplaces`、`workplace:*:detail`、`workplace:*:payroll-rules`、`workplace:*:timetables` を定義する。
- `lib/cache/revalidate.ts` の `revalidateWorkplaceDomainTags` は勤務先更新時に勤務先系と給与集計系のタグを `revalidateTag(tag, "max")` で再検証する。シフト更新も勤務先・給与系タグを再検証する。
- クライアントは `lib/query/query-keys.ts` と `lib/query/invalidation.ts` で勤務先 query を管理する。Server tag の再検証だけでは既存ブラウザ query cache は更新されないため、両レイヤーの整合が必要である。
- API は `lib/api/cache-control.ts` の `private, no-store, no-cache, must-revalidate` を基本とし、給与・シフト・勤務先情報を共有 HTTP キャッシュへ載せない。

## 3. 目標アーキテクチャ

1. **長寿命の最大キャッシュ**: 参照 DAL は `use cache` + `cacheLife("max")` を使う。再検証は30日、ハード有効期限は1年とする。ただし cached 関数の引数に `userId` と必要な ID を必ず含め、共有・ユーザー間混入を防ぐ。
2. **タグ設計**: ユーザー一覧タグと勤務先詳細/給与ルール/時間割タグを維持し、Mutation の所有確認後に対象タグだけを無効化する。給与スナップショット、サマリー、詳細は関連するユーザータグも無効化する。
3. **cached DAL**: Route Handler や Server Action は認証・所有確認・入力検証を担当し、DB 読み取りは `lib/cache/workplace-read-cache.ts` などの server-only DAL に集約する。キャッシュ値は `Date` や `Decimal` を文字列化したシリアライズ可能な DTO にする。
4. **即時整合**: 更新成功後、Server Action は対象タグへ `updateTag` を呼び、次の SSR が直ちに更新済み値を読むようにする。Action の応答は既存の DTO/`sync` 契約を返し、クライアントは既存の React Query invalidation を継続する。再取得完了を画面遷移の条件にしない。

## 4. Server Action 移行方針

- 更新操作を Server Action へ移す場合も、`requireSessionAndCurrentUser()`（または同等の共通入口）を最初に実行し、入力は既存 Zod 契約で検証する。
- `workplaceId`、`payrollRuleId`、`timetableSetId` は必ず current user 所有条件と同じ DB query で検証する。ID や内部モデル、token、秘密値をレスポンスへ返さない。
- 戻り値は `{ data, sync }` の既存契約に合わせ、DB 更新成功と Google Calendar 同期状態を分離する。同期は pending のままでも保存成功を返し、Calendar 編集をアプリへ逆同期しない。
- Action 内では DB 更新成功後に対象タグへ `updateTag` を呼ぶ。`updateTag` は Server Action 限定とし、Route Handler の mutation 経路は残さない。
- 勤務先・給与ルール・時間割の mutation REST Route Handler は削除し、公開しない。読み取り GET API は残し、`private, no-store, no-cache, must-revalidate` を付けて cached DAL を呼ぶ。

## 5. UI と query の挙動

- 勤務先一覧・詳細・給与ルール・時間割の query key は既存の `queryKeys.workplaces.*` を使用し、DTO 形状の異なる query を同じ key で共有しない。
- 保存成功時は既存の React Query invalidation で一覧/詳細/関連給与 query をドメイン単位で invalidate する。
- シフト入力 bootstrap は既存の `/api/shifts/form-bootstrap` を単一リクエストで使い、`workplaces`、`selectedWorkplace`、`payrollRules`、`timetableSets` をまとめて取得する。React Query は5分間 fresh とし、gcTime（保持期間）を15分に設定する。focus/reconnect の自動 refetch は無効化する。
- `placeholderData`、既存の LoadingOverlay、`aria-busy`、右下の「更新中」表示を維持する。初回ロード、再取得、保存中の表示を混同しない。
- エラー時は optimistic な表示を元に戻し、既存の共通エラーメッセージを使う。削除の Undo/hard delete 方針は現行設計書に従う。

## 6. 実装順序

1. タグ一覧、DTO 契約、所有確認、現行 query key、bootstrap の単一リクエスト契約を固定する。
2. 参照 DAL 全体を `cacheLife("max")`（30日再検証/1年 expiry）へ統一し、既存タグとシリアライズをテストする。
3. Mutation REST Route Handler を除去し、認証・検証・DB 更新・`updateTag`・既存 `sync` 応答を持つ Server Action へ移行する。
4. クライアントを Action 呼び出しへ段階移行し、既存の React Query invalidation と bootstrap の5分/15分・focus/reconnect 無効設定を維持する。
5. 読み取り GET API は private/no-store のまま cached DAL を利用することを確認し、不要な旧経路を削除する。

## 7. テスト・検証・レビュー

- cached DAL: user/勤務先の境界、全 user/workplace/rule/timetable タグ、DTO のシリアライズ、`cacheLife("max")` の30日再検証/1年 expiry。
- Mutation/Action: 未認証、所有外 ID、検証エラー、DB 成功後の `updateTag`、同期 pending/失敗、REST mutation が公開されていないこと。
- Read API/bootstrap: private/no-store ヘッダー、cached DAL 利用、bootstrap の単一リクエストと完全な payload、query の5分 fresh・15分 gcTime と focus/reconnect 無効化。
- UI/query: 既存 invalidation による 更新直後の一覧・詳細・給与表示、複数タブ/再取得、エラー時復元。
- 実装後は `pnpm format`、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm test` を実行し、一般レビューに加えて認証・認可・個人給与情報を security review する。

## 8. 既知の環境ブロッカー

この調査環境では、コマンド実行時に bubblewrap の namespace 作成が拒否されることがある（`bwrap: No permissions to create new namespace`）。その場合は検証結果を「環境ブロッカー」として記録し、権限のある実行環境で上記コマンドを再実行する。DB reset、migration、seed、`pnpm dev` は本方針の通常検証に含めない。
