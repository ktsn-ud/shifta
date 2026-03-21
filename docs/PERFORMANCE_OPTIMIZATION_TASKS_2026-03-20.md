# パフォーマンス最適化実装タスク（2026-03-20）

このドキュメントは [PERFORMANCE_OPTIMIZATION_PLAN_2026-03-20.md](PERFORMANCE_OPTIMIZATION_PLAN_2026-03-20.md) の修正計画を実装単位に分割しています。  
各タスクは Agent への依頼に適した粒度で設計されています。

**凡例**

- Status: `TODO` / `IN_PROGRESS` / `COMPLETED`
- Size: `XS` (30min), `S` (1h), `M` (2-3h), `L` (5-8h), `XL` (10h+)
- Type: `implement` / `test` / `refactor` / `doc`

---

## Phase 1: P0 実装（CRITICAL：1-2週間）

### T1-1: 導線 prefetch 復帰（app-sidebar, site-header）

**Status**: TODO  
**Size**: XS  
**Type**: fix  
**Priority**: P0-1

**概要**  
`prefetch={false}` を削除し、ページ遷移の事前読み込みを復帰。

**実装内容**

1. `components/app-sidebar.tsx` L84, L104 の `prefetch={false}` 削除
2. `components/site-header.tsx` L187 の `prefetch={false}` 削除
3. 必要に応じて `prefetch="intent"` で軽量 prefetch へ

**検証項目**

- [ ] Lint 通過
- [ ] TypeScript 型チェック通過
- [ ] Dev server で 404/broken route がないことを確認

**関連ファイル**

- components/app-sidebar.tsx
- components/site-header.tsx

**ベストプラクティス根拠**

- Vercel: async-suspense-boundaries
- Next.js Link API: prefetch default behavior

**依頼ノート**

- 修正後は必ず `pnpm format` を実行してコミット

---

### T1-2: シフト POST API のバックグラウンド同期化

**Status**: TODO  
**Size**: M  
**Type**: refactor  
**Priority**: P0-2

**概要**  
`POST /api/shifts` をリクエストハンドラから Google sync の同期待機を排除。  
`after()` で非同期化し、API レスポンスを 100-200ms に短縮。

**実装内容**

1. `app/api/shifts/route.ts` の createShift 関数を修正
   - L100 の `await syncShiftAfterCreate(shift.id);` を削除
   - `after(async () => syncShiftAfterCreate(shift.id))` へ移行
   - レスポンス JSON に `syncStatus: "pending"` を追加

2. エラーハンドリング
   - `after()` ブロック内での exception は console.error のみ（クライアント影響なし）

3. 既存 bulk API pattern を参照（L191 の `after()` 使用例）

**検証項目**

- [ ] `time curl` で API 応答時間が 6s → 200ms に短縮を確認
- [ ] sync status polling (`GET /api/shifts/:id/sync-status`) で status が pending → completed へ遷移を確認
- [ ] Google API failure でもレスポンスはブロックされない
- [ ] Lint / TypeScript 大丈夫

**関連ファイル**

- app/api/shifts/route.ts (createShift関数, L100付近)
- lib/google-calendar/syncEvent.ts (既存同期ロジック)
- app/api/shifts/[id]/sync-status (既存ステータスエンドポイント)

**ベストプラクティス根拠**

- Vercel: async-api-routes (DB操作完了後、非I/O処理は遅延)
- Vercel: server-after-nonblocking (`after()` で I/O 待ちを隠蔽)

**依頼ノート**

- bulk API（L191付近）と同じパターンで実装
- リトライロジックは既存 syncStatus.ts のまま継続

---

### T1-3: シフト PUT API のバックグラウンド同期化

**Status**: TODO  
**Size**: M  
**Type**: refactor  
**Priority**: P0-2

**概要**  
`PUT /api/shifts/:id` （更新）を Google sync 非同期化。 T1-2 と同じパターン。

**実装内容**

1. `app/api/shifts/[id]/route.ts` の updateShift 関数を修正
   - L127-129 の `await syncShiftAfterUpdate(shift.id);` を `after()` へ移行
   - レスポンス JSON に `syncStatus: "pending"` を追加

**検証項目**

- [ ] API 応答時間が 6s → 200ms 短縮を確認
- [ ] sync status polling で pending → completed へ遷移
- [ ] Lint / TypeScript 大丈夫

**関連ファイル**

- app/api/shifts/[id]/route.ts (updateShift関数, L127付近)

**依頼ノート**

- T1-2 と同じ方針で実装

---

### T1-4: シフト DELETE API のバックグラウンド同期化

**Status**: TODO  
**Size**: M  
**Type**: refactor  
**Priority**: P0-2

**概要**  
`DELETE /api/shifts/:id` （削除）を Google sync 非同期化。

**実装内容**

1. `app/api/shifts/[id]/route.ts` の deleteShift 関数を修正
   - L178-184 の `await syncShiftDeletion(shift.id);` を `after()` へ移行
   - レスポンス JSON に `syncStatus: "pending"` を追加

**検証項目**

- [ ] API 応答時間短縮を確認
- [ ] sync status polling で pending → completed へ遷移
- [ ] Lint / TypeScript 大丈夫

**関連ファイル**

- app/api/shifts/[id]/route.ts (deleteShift関数, L178付近)

**依頼ノート**

- T1-2, T1-3 と同じ方針

---

### T1-5: シフト確定 PATCH API のバックグラウンド同期化

**Status**: TODO  
**Size**: M  
**Type**: refactor  
**Priority**: P0-2

**概要**  
`PATCH /api/shifts/:id/confirm` （確定）を Google sync 非同期化。

**実装内容**

1. `app/api/shifts/[id]/confirm/route.ts` を修正
   - L97 の `await syncShiftAfterUpdate(shift.id);` を `after()` へ移行
   - レスポンス JSON に `syncStatus: "pending"` を追加

**検証項目**

- [ ] API 応答時間短縮を確認
- [ ] sync status polling で pending → completed へ遷移
- [ ] Lint / TypeScript 大丈夫

**関連ファイル**

- app/api/shifts/[id]/confirm/route.ts (L97付近)

**依頼ノート**

- T1-2, T1-3 と同じ方針

---

### T1-6: シフト管理ページに loading.tsx を追加

**Status**: TODO  
**Size**: S  
**Type**: implement  
**Priority**: P0-3

**概要**  
シフト新規作成・編集ページへの遷移時に Suspense ローディング表示を追加。

**実装内容**

1. `app/my/shifts/new/loading.tsx` を新規作成
   - タイトル「シフト新規作成」表示
   - `ShiftFormSkeleton` を表示

2. `app/my/shifts/[id]/edit/loading.tsx` を新規作成
   - タイトル「シフト編集」表示
   - `ShiftFormSkeleton` を表示

**コード例**

```typescript
// app/my/shifts/new/loading.tsx
import { ShiftFormSkeleton } from "@/components/ui/loading-skeletons";

export default function Loading() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">シフト新規作成</h1>
      <ShiftFormSkeleton />
    </div>
  );
}
```

**検証項目**

- [ ] 遷移時に loading.tsx が表示された後、page.tsx が render されることを確認
- [ ] Slow 3G network 環境で smooth 遷移を観察

**関連ファイル**

- app/my/shifts/new/loading.tsx (新規)
- app/my/shifts/[id]/edit/loading.tsx (新規)
- components/ui/loading-skeletons.tsx (既存)

**依頼ノート**

- 既存 loading-skeletons.ts から ShiftFormSkeleton を活用

---

### T1-7: 勤務先管理ページに loading.tsx を追加

**Status**: TODO  
**Size**: S  
**Type**: implement  
**Priority**: P0-3

**概要**  
勤務先追加・編集ページへの遷移時に Suspense ローディング表示を追加。

**実装内容**

1. `app/my/workplaces/new/loading.tsx` を新規作成
   - タイトル「勤務先追加」表示
   - 適切な skeleton UI を表示

2. `app/my/workplaces/[id]/edit/loading.tsx` を新規作成
   - タイトル「勤務先編集」表示
   - 適切な skeleton UI を表示

**検証項目**

- [ ] 遷移時に loading.tsx が表示
- [ ] page.tsx render 後に内容が正常表示

**関連ファイル**

- app/my/workplaces/new/loading.tsx (新規)
- app/my/workplaces/[id]/edit/loading.tsx (新規)
- components/ui/loading-skeletons.tsx (既存)

**依頼ノート**

- T1-6 と同じパターン

---

## Phase 2: P1 実装（中期構造改善：2-4週間）

### T2-1: React.cache() による requireCurrentUser() 最適化

**Status**: TODO  
**Size**: M  
**Type**: refactor  
**Priority**: P1-1

**概要**  
`requireCurrentUser()` の per-request deduplication により、単一 layout での auth() が複数 page から呼ばれてもDB照会が 1回に削減。

**実装内容**

1. `lib/auth.ts` の `requireCurrentUser()` を修正
   - `React.cache()` でラップし、per-request dedup を有効化
   - `await auth()` → `await prisma.user.findUnique()` が 1回のみ実行

**コード例**

```typescript
// lib/auth.ts
import { cache } from "react";

const getCachedUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { payrollRules: true, workplaces: true }, // 既存の include をそのまま
  });
  if (!user) throw new Error("User not found");
  return user;
});

export async function requireCurrentUser() {
  return getCachedUser();
}
```

**検証項目**

- [ ] `prisma.user.findUnique` が 1回のみ実行を Server log で確認
- [ ] `app/my` 配下でページ遷移後、auth 情報が正常に使用される
- [ ] TypeScript 型チェック大丈夫

**関連ファイル**

- lib/auth.ts (requireCurrentUser関数)

**ベストプラクティス根拠**

- Vercel: server-cache-react (per-request dedup)

**依頼ノート**

- Next.js 16 では React 19 が含まれるため`React.cache()` は利用可能

---

### T2-2: app/my/layout.tsx での auth() 一元化

**Status**: TODO  
**Size**: M  
**Type**: refactor  
**Priority**: P1-1

**概要**  
app/my/layout.tsx で 1 度だけ auth を実行し、子 page での重複 auth() 呼び出しを削除。

**実装内容**

1. `app/my/layout.tsx` を修正
   - `const user = await requireCurrentUser();` を追加
   - 既存 layout に auth() / requireCurrentUser() がないかチェック（見つかれば削除）

2. 子 page ファイルの `auth()` 呼び出しを削除
   - `app/my/*/page.tsx` で重複 auth() を呼び出している箇所を削除

**コード例**

```typescript
// app/my/layout.tsx
import { requireCurrentUser } from "@/lib/auth";

export default async function MyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser(); // layout で 1回のみ実行
  // user を必要に応じて prop/context で supply
  return (
    <div className="...">
      {children}
    </div>
  );
}
```

**検証項目**

- [ ] `app/my` 配下各ページでの auth() 呼び出しが 1回のみ（layout）
- [ ] ページレンダリング正常
- [ ] TypeScript 型チェック大丈夫

**関連ファイル**

- app/my/layout.tsx
- app/my/\*/page.tsx (複数ページ)

**依頼ノート**

- 子 page での重複 auth() を Explore で検出

---

### T2-3: app/my/page.tsx (dashboard) を RSC 化

**Status**: TODO  
**Size**: L  
**Type**: refactor  
**Priority**: P1-2

**概要**  
Dashboard ページを Client Component から Server Component へ変更。  
データは server-side で fetch し、Suspense でストリーミング化。

**実装内容**

1. `app/my/page.tsx` の修正
   - `"use client"` directive を削除
   - Client-side `useState`, `useEffect` を削除
   - server-side `fetch` / API call へ変更
   - Suspense boundary で streaming 対応

2. フォーム / 対話的 UI は別 Client Component （modal など）へ分離

**検証項目**

- [ ] ページ遷移後、server-side render により content が即座に hydrate
- [ ] client-side fetch の waterfall が発生しない
- [ ] TypeScript 型チェック大丈夫

**関連ファイル**

- app/my/page.tsx

**ベストプラクティス根拠**

- Vercel: server-parallel-fetching (RSC で parallel fetch)

**依頼ノート**

- dashboard の詳細仕様を DESIGN_SPECIFICATION.md で確認してから実装

---

### T2-4: app/my/shifts/page.tsx (shift list) を RSC 化

**Status**: TODO  
**Size**: L  
**Type**: refactor  
**Priority**: P1-2

**概要**  
出勤シフト一覧を Server Component 化。

**実装内容**

1. `app/my/shifts/page.tsx` の修正
   - `"use client"` 削除
   - Client-side fetch を server-side へ移行
   - `GET /api/shifts` call を直接呼び出し or library化

2. Suspense で streaming

**検証項目**

- [ ] ページロード時に shift list がすぐ表示
- [ ] client-side fetch waterfall なし
- [ ] TypeScript 型チェック大丈夫

**関連ファイル**

- app/my/shifts/page.tsx

**依頼ノート**

- T2-3 と同じパターン

---

### T2-5: app/my/workplaces/page.tsx (workplace list) を RSC 化

**Status**: TODO  
**Size**: L  
**Type**: refactor  
**Priority**: P1-2

**概要**  
勤務先一覧を Server Component 化。

**実装内容**

1. `app/my/workplaces/page.tsx` の修正

**検証項目**

- [ ] ページロード時に workplace list がすぐ表示
- [ ] TypeScript 型チェック大丈夫

**関連ファイル**

- app/my/workplaces/page.tsx

**依頼ノート**

- T2-3 と同じパターン

---

### T2-6: その他 /my 配下ページの RSC 化（段階的）

**Status**: TODO  
**Size**: XL  
**Type**: refactor  
**Priority**: P1-2

**概要**  
残る page ファイル (`/my/calendar`, `/my/summary`, `/my/payroll` など) を RSC 化。

**実装内容**

- 各ページで `"use client"` を削除
- server-side fetch へ移行
- client-side interaction は Client Component へ分離

**検証項目**

- [ ] 各ページでのネットワークウォーターフォール排除
- [ ] TypeScript 型チェック大丈夫

**関連ファイル**

- app/my/calendar/page.tsx
- app/my/summary/page.tsx
- app/my/payroll/page.tsx
- etc.

**依頼ノート**

- 各ページの詳細は DESIGN_SPECIFICATION.md で確認

---

### T2-7: cache: "no-store" の見直し（hooks）

**Status**: TODO  
**Size**: M  
**Type**: refactor  
**Priority**: P1-3

**概要**  
`hooks/use-month-shifts.ts` など、20箇所の `cache: "no-store"` を要件に応じて `revalidate` または `on-demand ISR` へ変更。

**実装内容**

1. `hooks/use-month-shifts.ts` L103-106 を修正
   - 月内シフトは（ユーザースケール短期的に変更がない場合）`next: { revalidate: 300 }` (5分) へ
   - またはユーザーが明示的に refresh する UI へ

2. 他の `cache: "no-store"` も同様に見直し

**判断基準**

- リアルタイム更新必須 → `no-store` 継続
- 数分の遅延許容 → `revalidate: 60-300`
- ユーザー明示的 refresh → `on-demand ISR` (revalidateTag)

**検証項目**

- [ ] Network tab で fetch 頻度が削減されている
- [ ] ユーザー操作で古いデータが表示される場合は refresh ボタンで更新可能

**関連ファイル**

- hooks/use-month-shifts.ts
- その他 fetch with cache: "no-store" の箇所（20箇所）

**ベストプラクティス根拠**

- Vercel: bundle-dedup-fetches (동일 request の자동 dedup)

**依頼ノート**

- 見直し前に要件確認が必要（どの data が truly realtime か）

---

## Phase 3: P2 実装（発展：3-6週間、要件優先度により判定）

### T3-1: Google Calendar Sync ジョブキュー化（Option B: Proper Queue）

**Status**: TODO  
**Size**: XL  
**Type**: implement  
**Priority**: P2-1

**概要**  
`sync_jobs` table を Prisma schema に追加。  
API は DB save + job enqueue のみ同期実行。  
Background Worker がジョブを非同期処理。

**実装内容**（大項目）

1. **Prisma schema 拡張**
   - `sync_jobs` table: `{ id, shiftId, type ("create"|"update"|"delete"), status ("pending"|"processing"|"completed"|"failed"), retryCount, scheduledAt, lastError, createdAt }`

2. **API 修正** (T1-2 ~ T1-5 の修正を改善)
   - DB save 後、sync_job をenqueue する
   - `after()` で Worker へ dispatch

3. **Background Worker 実装**
   - Cron/Queue runner でループ
   - Exponential backoff リトライ (max 5回)
   - 失敗を UI で可視化

4. **UI: sync-status endpoint 拡張**
   - job history fetch, error message 表示

**依頼時の前置条件**

- T1-2 ~ T1-5 完了後、要件確認してから着手
- ボリュームが大きいため複数 Agent コール必要の可能性

**依頼ノート**

- Option A（最小限、既存資産活用のみ）で先に effect を見て、P2-1 の合理性を判定推奨

---

### T3-2: ShiftForm / BulkShiftForm の next/dynamic 遅延ロード

**Status**: COMPLETED  
**Size**: S  
**Type**: refactor  
**Priority**: P2-2

**概要**  
大容量フォーム（計 3000行以上）を `next/dynamic` で分割 bundle 化。

**実装内容**

1. `app/my/shifts/new/page.tsx` で ShiftForm を lazy load

   ```typescript
   import dynamic from "next/dynamic";
   const ShiftForm = dynamic(
     () => import("@/components/shifts/ShiftForm"),
     { loading: () => <ShiftFormSkeleton /> }
   );
   ```

2. `app/my/shifts/[id]/edit/page.tsx` でも同様

3. `app/my/bulk/page.tsx` で BulkShiftForm を lazy load

**検証項目**

- [ ] Build 後の `.next/static/chunks` で bundle size 削減を確認
- [ ] Lighthouse performance score 改善

**関連ファイル**

- app/my/shifts/new/page.tsx
- app/my/shifts/[id]/edit/page.tsx
- app/my/bulk/page.tsx

**ベストプラクティス根拠**

- Vercel: bundle-dynamic-imports (大容量 component の分割)

**依頼ノート**

- 既に loading.tsx が設定されている場合は、dynamic の loading オプションと調整

---

### T3-3: パフォーマンス計測・検証（計測インフラ）

**Status**: TODO  
**Size**: L  
**Type**: implement  
**Priority**: P2 (Optional)

**概要**  
Phase 1-2 完了後の効果検証および継続的なパフォーマンス監視 infra。

**実装内容（選択肢）**

1. **Server-Timing ヘッダ**
   - Route handler に `Server-Timing` ヘッダを追加
   - `auth`, `db`, `google-sync` の分解表示

2. **Client-side 計測** (Web Vitals)
   - `web-vitals` library で LCP, FID, CLS を記録
   - 本番環境ログ送信設定

3. **Dashboard** (optional)
   - P50/P95, error rate をダッシュボード可視化

**依頼時の前置条件**

- Phase 1-2 の効果確認後、本当に必要か判定

**依頼ノート**

- ベースラインを Phase 1 完了時点で取得推奨

---

## 実装順序チェックリスト

Phase 1 推奨順序:

- [ ] T1-1 (prefetch 復帰) → 最速で体感改善
- [ ] T1-2, T1-3, T1-4, T1-5 (sync 非同期化) → 保存時レイテンシ改善
- [ ] T1-6, T1-7 (loading.tsx) → UX体感改善

Phase 2 推奨順序:

- [ ] T2-1, T2-2 (auth 最適化) → infrastructure 整備
- [ ] T2-3～T2-6 (RSC 化) → waterfall 排除
- [ ] T2-7 (no-store 見直し) → fetch 頻度最適化

Phase 3 (要件優先度による):

- [ ] T3-1 (ジョブキュー) → 堅牢性向上
- [ ] T3-2 (dynamic import) → bundle 最適化
- [ ] T3-3 (計測) → 継続的監視

---

## タスクステート管理

新規実装時は以下の流れで進行:

1. **計画確認**: Agent に task ticket を示す
2. **実装**: Agent による修正実施
3. **検証**: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm format` 実施
4. **コミット**: Git commit（粒度は 1 task = 1 commit）
5. **Status 更新**: このドキュメントの Status を `COMPLETED` へ

---

## 参考リソース

- [AGENTS.md](../AGENTS.md) - MCP, ベストプラクティス
- [PERFORMANCE_OPTIMIZATION_PLAN_2026-03-20.md](PERFORMANCE_OPTIMIZATION_PLAN_2026-03-20.md) - 詳細計画
- [PERFORMANCE_INVESTIGATION_2026-03-19.md](PERFORMANCE_INVESTIGATION_2026-03-19.md) - 背景分析
- Vercel React Best Practices: `.agents/skills/vercel-react-best-practices/SKILL.md`
