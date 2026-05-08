# パフォーマンス・TanStack Query 実装後監査（2026-05-08）

## 監査対象

- `docs/PERFORMANCE_SECURITY_UX_CACHE_STRATEGY_2026-05-02.md`
- `docs/TANSTACK_QUERY_ADOPTION_EVALUATION_2026-05-07.md`

## 残課題

### 給与詳細切り替えボタンの Base UI semantics 警告

対象ルート:

- `/my/payroll-details/monthly`
- `/my/payroll-details/workplace-yearly`

確認内容:

- Next.js MCP `get_errors` で、`components/payroll-details/payroll-details-view-switch.tsx` の `Button` が Base UI の button semantics 警告を出している。
- 警告は `components/ui/button.tsx` の `nativeButton` 前提と、`PayrollDetailsViewSwitch` 側の `render={<Link href={href} />}` の組み合わせで発生している。

影響:

- ネイティブ `<button>` として期待されるセマンティクスが失われ、フォーム・キーボード操作・アクセシビリティに影響する可能性がある。

解決方針:

- `PayrollDetailsViewSwitch` では、実体がページ遷移リンクであるため、`Button render={<Link ... />}` ではなく `Link` に `buttonVariants()` を適用する形へ寄せる。
- 代替として Base UI の `nativeButton` 前提を明示的に外せる場合は、`Button` 側の設計に沿って `nativeButton={false}` 相当の扱いを検討する。ただし、本件はリンクなので `Link` + button style の方が責務が明確。
- 修正後は Next.js MCP `get_errors` で Base UI semantics 警告が消えることを確認する。

### 勤務先詳細 query key の DTO 形状衝突

対象ルート:

- `/my/workplaces/[workplaceId]/edit`
- `/my/workplaces/[workplaceId]/payroll-rules`
- `/my/workplaces/[workplaceId]/timetables`
- `/my/workplaces/[workplaceId]/payroll-rules/new`
- `/my/workplaces/[workplaceId]/payroll-rules/[ruleId]/edit`
- `/my/workplaces/[workplaceId]/timetables/new`
- `/my/workplaces/[workplaceId]/timetables/[id]/edit`

確認内容:

- `components/workplaces/workplace-form.tsx` は `queryKeys.workplaces.detail({ workplaceId })` で、`closingDayType`, `closingDay`, `payday` を含む勤務先編集用DTOを期待している。
- `lib/query/queries/workplaces.ts` の `useWorkplaceDetailQuery()` と、`components/workplaces/payroll-rule-form.tsx` / `components/workplaces/timetable-form.tsx` も同じ `queryKeys.workplaces.detail({ workplaceId })` を使うが、これらは `id`, `name`, `type`, `color` 程度の軽量DTOとして扱っている。
- 給与ルール一覧・時間割一覧ページは Server Component から軽量な `initialWorkplace` を渡し、同じ detail query key に `initialData` として注入している。
- その状態で勤務先編集へ遷移すると、勤務先編集フォームが既存 query cache の軽量DTOを読み、`closingDayType`, `closingDay`, `payday` が欠落した状態で初期化される可能性がある。

影響:

- 勤務先編集フォームで締日・給料日の初期値が不正または未定義になる可能性がある。
- TanStack Query cache は query key 単位で共有されるため、同一 key で異なるDTO形状を扱うと、遷移順に依存する表示不具合が起きる。

解決方針:

- query key をDTO用途別に分離する。例: 軽量表示用を `queryKeys.workplaces.detailSummary({ workplaceId })`、編集フォーム用を `queryKeys.workplaces.editDetail({ workplaceId })` のように分ける。
- `useWorkplaceDetailQuery()` は現在の軽量DTO用途に限定し、勤務先編集フォームには `useWorkplaceEditDetailQuery()` などの専用queryを追加する。
- `components/workplaces/workplace-form.tsx` は編集フォーム用query keyを使い、`closingDayType`, `closingDay`, `payday` を必須として parse する。
- `components/workplaces/payroll-rule-form.tsx`, `components/workplaces/timetable-form.tsx`, 一覧ページの `initialWorkplace` は軽量DTO用query keyを使う。
- `lib/query/__tests__/query-keys.test.ts` に、軽量詳細keyと編集詳細keyが衝突しないことを追加する。
- 修正後は、給与ルール一覧または時間割一覧から勤務先編集へ遷移しても、締日・給料日の初期値が正しく表示されることを確認する。

### フォーム保存後の TanStack Query invalidation 漏れ

対象ルート:

- `/my/workplaces/new`
- `/my/workplaces/[workplaceId]/edit`
- `/my/workplaces/[workplaceId]/payroll-rules/new`
- `/my/workplaces/[workplaceId]/payroll-rules/[ruleId]/edit`
- `/my/workplaces/[workplaceId]/timetables/new`
- `/my/workplaces/[workplaceId]/timetables/[id]/edit`

確認内容:

- 上記フォームは保存後に `router.push()` で一覧へ戻るが、Client 側の TanStack Query cache を `invalidateAfterWorkplaceMutation` / `invalidateAfterPayrollRuleMutation` / `invalidateAfterTimetableMutation` で無効化していない。
- 対応する API route 側では server cache tag の `revalidateTag()` は実行されているが、既にブラウザに存在する TanStack Query cache は別レイヤーのため、それだけでは無効化されない。
- 一覧ページは Server Component から `initialData` を渡しているが、同じ query key の cache が既にある場合、既存 cache が優先される可能性がある。
- `invalidateAfterPayrollRuleMutation()` は `["workplaces", "payrollRules", { workplaceId }]` を無効化していないため、給与ルール作成・編集後にこの helper を呼ぶだけでは給与ルール一覧 query が stale のまま残る。

影響:

- 勤務先・給与ルール・時間割を作成または編集した直後、遷移先の `/my/workplaces`、`/my/workplaces/[workplaceId]/payroll-rules`、`/my/workplaces/[workplaceId]/timetables` で stale 表示が残る可能性がある。
- `staleTime` 中はユーザーが保存結果を即時確認できず、再読み込みまたは自然再取得まで反映が遅れる可能性がある。

補足:

- シフト作成・編集・一括登録は `invalidateAfterShiftMutation()` を呼んでいる。
- 勤務先・給与ルール・時間割の削除系一覧操作は、それぞれ invalidation と `setQueryData()` を実行している。
- そのため、残課題は主にフォーム経由の作成・編集ルートに限定される。

解決方針:

- `components/workplaces/workplace-form.tsx` に `getBrowserQueryClient()` と `invalidateAfterWorkplaceMutation()` を導入し、作成・編集成功後、遷移前に Client query cache を無効化する。
- `components/workplaces/payroll-rule-form.tsx` に `invalidateAfterPayrollRuleMutation(queryClient, workplaceId)` を導入し、作成・編集成功後、一覧へ戻る前に無効化する。
- `components/workplaces/timetable-form.tsx` に `invalidateAfterTimetableMutation(queryClient, workplaceId)` を導入し、作成・編集成功後、一覧へ戻る前に無効化する。
- `lib/query/invalidation.ts` の `invalidateAfterPayrollRuleMutation()` は、`queryKeys.workplaces.payrollRules({ workplaceId })` 相当の一覧queryも無効化対象に含める。
- `invalidateAfterTimetableMutation()` は、時間割一覧queryに加えて、勤務先詳細が時間割可否判定に使われる箇所があるため、必要に応じて workplace detail summary/edit detail のqueryも無効化する。
- 保存後に即時反映したい画面では、invalidation だけで不十分な場合に `setQueryData()` で戻り先一覧の表示を更新する。ただし、まずは mutation 成功後の invalidation を統一する。
- 修正後は、勤務先・給与ルール・時間割の作成/編集後に一覧へ戻り、`staleTime` 中でも古い表示が残らないことを確認する。
