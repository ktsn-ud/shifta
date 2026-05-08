# パフォーマンス最適化計画（2026-03-20）

## 計画の目的と方針

- **パフォーマンス調査レポート**（2026-03-19）の分析は検証済み・正確
- Vercel React Best Practices（CRITICAL カテゴリ）に従い、段階的に最適化
- 各タスクは独立性を保ち、Agentによる実装を想定
- 修正後は `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm format` で検証

## 実装前の前提確認

- Next.js 16, React 19で Suspense + Server Component は完全サポート
- `after()` API（App Router）は使用可能状態
- Google Calendar Sync は既存API構造を維持し、UI層で非同期表示へ
- DB機構（Prisma, schema）への変更は最小限に

---

## P0: 即効性大（1-2週間で実装可能）

体感遅延を最短で改善する施策。実装順序は 1 → 2 → 3 が推奨。

### P0-1. ページ遷移 prefetch 復帰

**課題**  
`prefetch={false}` により、毎回ナビゲーション時に fetch 待ちが発生。

**対象ファイル**

- `components/app-sidebar.tsx` L84, L104
- `components/site-header.tsx` L187

**修正内容**

- `prefetch={false}` を削除し、デフォルト prefetch=true で復帰
- または必要に応じて `prefetch="intent"` で軽量 prefetch へ

**根拠（ベストプラクティス）**

- Vercel: `async-suspense-boundaries` - prefetch により遷移時に content を並列ロード
- Next.js Link: デフォルトで `prefetch=true`（App Router）は推奨動作

**検証方法**

- 修正前後で Dev Tools Network tab でリソース先読みを観察
- 遷移時のレイテンシ改善を定性的に確認

**副課題（もし 404 や破壊的遷移が発生した場合）**

- 一部ルートに限定して `prefetch={false}` 残存も検討

**ボリューム**

- 修正: 3ヶ所, 1ファイル配置
- 実装時間: 最小 30 分以内

---

### P0-2. シフト操作 API のバックグラウンド同期化

**課題**  
単体保存/更新/削除/確定が Google Calendar sync を同期待機（500-6000ms）。

**対象ファイル**

- `app/api/shifts/route.ts` (POST, createShift)
- `app/api/shifts/[id]/route.ts` (PUT update, DELETE delete)
- `app/api/shifts/[id]/confirm/route.ts` (PATCH confirm)
- `lib/google-calendar/syncEvent.ts` （既存同期ロジック）
- `lib/google-calendar/syncStatus.ts` （ステータスポーリング）

**修正内容**

1. **API レスポンス即時化**
   - DB 保存後、Google sync は `after()` へ移行
   - クライアントへは `{ success: true, shift: {...}, syncStatus: "pending" }` を即返却

2. **同期ジョブの enqueue 先**
   - 既存: `syncStatus.ts` の retry ロジックをそのまま活用
   - `after()` の async block 内で `syncShiftAfterCreate(shiftId)` を呼び出し
   - リトライが失敗してもレスポンスはブロックされない

3. **クライアント側の表示**
   - 既存の `GET /api/shifts/[id]/sync-status` エンドポイント活用
   - ページロードまたはツールチップで sync status を polling
   - 完了時（sync.status = 'completed'）で動的な UI 更新

**根拠（ベストプラクティス）**

- Vercel: `async-api-routes` - DB操作完了後、非同期処理は start late
- Vercel: `server-after-nonblocking` - `after()` で I/O 待ちを隠蔽
- bulk API 既に実装済み（L191 `after()` の参考例）

**実装詳細**

**app/api/shifts/route.ts (POST)**

```typescript
// before
await syncShiftAfterCreate(shift.id);
return Response.json({ success: true, shift });

// after
// DB save は同期的に確認済み
after(async () => {
  try {
    await syncShiftAfterCreate(shift.id);
  } catch (error) {
    // log のみ、クライアントへはブロックしない
    console.error(`Sync failed for shift ${shift.id}`, error);
  }
});
return Response.json({ success: true, shift, syncStatus: "pending" });
```

**app/api/shifts/[id]/route.ts (PUT/DELETE)**

- 同様に `after()` へ移行

**app/api/shifts/[id]/confirm/route.ts (PATCH)**

- `after(async () => syncShiftAfterUpdate(shiftId))`

**検証方法**

- 修正前: `time curl -X POST http://localhost:3000/api/shifts -d {...}` で Google API timeout なら 6000ms+ 待機
- 修正後: sync ステータスを polling で確認しつつ、API レスポンスは 100-200ms に短縮
- ネットワーク分断/Google API failure でもクライアント操作はブロックされない

**副課題**

- Prisma `after()` の実装が未知の場合は `next-devtools` で `nextjs_docs` で確認

**テスト項目**

- [ ] sync pending 中に同じシフトを連続保存しても UI が混乱しない
- [ ] Google sync failure に対して graceful error 表示
- [ ] Sync retry は max 5 回で停止

**ボリューム**

- 修正ファイル: 4つ
- 1ファイルあたり: 30-60 行修正
- 実装時間: 2-3 時間

---

### P0-3. ページロード時に loading.tsx で先制ローディング表示

**課題**  
重いセグメント（フォーム、フェッチ）へ遷移する際、UI が blank で待機。

**対象ファイル**

- `app/my/shifts/new/loading.tsx` （新規作成フォーム）
- `app/my/shifts/[id]/edit/loading.tsx` （編集フォーム）
- `app/my/workplaces/new/loading.tsx` （勤務先追加）
- `app/my/workplaces/[id]/edit/loading.tsx` （勤務先編集）

**修正内容**

- Next.js の `loading.tsx` ファイルを各セグメントに追加
- フォーム skeleton UI を実装（既存 `components/ui/loading-skeletons.tsx` 活用）
- Route transition → loading.tsx 表示 → page.tsx render という順序で視覚的な即応性を向上

**根拠（ベストプラクティス）**

- Next.js official: `loading.js` は Suspense boundary で自動生成
- UX改善: 実時間は変わらないが loading 表示により体感速度が大幅向上

**実装詳細**

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

**検証方法**

- Dev Tools Network で Slow 3G で遷移テスト
- loading.tsx が表示されてから page.tsx 描画まで smooth 遷移を確認

**ボリューム**

- 新規ファイル: 4つ
- 既存 skeleton の活用で最小コード量

**実装時間**: 1 時間以内

---

## P1: 中期構造改善（2-4週間）

根本的なアーキテクチャ改善。P0 適用後に検証しながら段階実施推奨。

### P1-1. 認証 DB 照会の削減（セッション層最適化）

**課題**  
`prisma.user.findUnique()` が `/my` 配下・毎リクエストで実行。

**現状**

- `lib/auth.ts` L143-152: `requireCurrentUser()` → email から user lookup
- `app/my/layout.tsx` L17: 毎 page で `auth()` 呼び出し
- 実測: DB round-trip 30-50ms × 多発

**修正内容**

1. **Session に userId / calendarId を persistent化**
   - 既存: email 取得のみ
   - 新: `{ userId: string, calendarId: string, email: string }` を session payload に持つ
   - Prisma query スキップ可能に

2. **`requireCurrentUser()` の restructure**
   - cache: "use cache" （Next.js 16, React.cache）で per-request dedup
   - あるいは session layer に移行（middleware 層）

3. **`app/my/layout.tsx` での single auth() call**
   - 現在: page ごとに `auth()` 実行
   - 新: layout で 1回のみ、子 page へ props 経由で supply

**根拠（ベストプラクティス）**

- Vercel: `server-cache-react` - React.cache() で per-request dedup
- Vercel: `server-auth-actions` - auth は minimal DB query で実施
- Next.js: Middleware での early auth check

**実装詳細**

**lib/auth.ts**

```typescript
// before
export async function requireCurrentUser() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) throw new Error("User not found");
  return user;
}

// after (with React.cache)
import { cache } from "react";

const getCachedUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) throw new Error("User not found");
  return user;
});

export async function requireCurrentUser() {
  return getCachedUser();
}
```

**app/my/layout.tsx**

```typescript
// before: page ごとに auth() 呼び出し
// after: 1回のみ、children へ supply

import { requireCurrentUser } from "@/lib/auth";

export default async function MyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  return (
    <MyAdminContext.Provider value={{ user }}>
      {children}
    </MyAdminContext.Provider>
  );
}
```

**検証方法**

- `app/my` 配下でページ遷移
- Prisma query log で `user.findUnique` が 1 回のみ実行を確認
- Server-Timing ヘッダで auth タイムを計測

**影響範囲**

- `lib/auth.ts` (1ファイル)
- `app/my/layout.tsx` (1ファイル)
- 子 page で `auth()` を削除/キャッシュ利用へ変更

**ボリューム**: 2-3 時間

---

### P1-2. Client Component → Server Component 化の拡大

**課題**  
`app/my` 配下 15ページ全て `"use client"` → clien-side fetch → 遷移後 waterfall。

**修正戦略**

**Phase 1: Single Source of Truth（SSoT） の構築**

- Shift 一覧、勤務先一覧は Server Component で fetch
- Suspense boundary で streaming 化

**Phase 2: Client の境界縮小**

- Form（edit mode, validation）のみ Client Component へ
- 表示部は RSC へ逆戻し

**対象ファイル**

- `app/my/page.tsx` （dashboard） → RSC 化
- `app/my/shifts/page.tsx` （shift list） → RSC 化
- `app/my/calendar/page.tsx` （calendar view） → 要検証
- `app/my/workplaces/page.tsx` （workplace list） → RSC 化
- etc.

**修正内容（例: app/my/shifts/page.tsx）**

```typescript
// before
"use client"
export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  useEffect(() => {
    fetch("/api/shifts").then(..);
  }, []);
  return <ShiftList shifts={shifts} />;
}

// after
export default async function ShiftsPage() {
  const shifts = await fetchShifts();
  return (
    <Suspense fallback={<ShiftListSkeleton />}>
      <ShiftList shifts={shifts} />
    </Suspense>
  );
}

// 編集フォーム用 Client Component はモーダル/layout へ隔離
```

**根拠（ベストプラクティス）**

- Vercel: `server-parallel-fetching` - RSC で parallel fetch することで waterfall 排除
- Vercel: `async-suspense-boundaries` - Suspense で streaming, progressive rendering

**検証方法**

- 修正前: Network tab でクリック → API呼び出し完了までラグを観察（秒単位）
- 修正後: Server rendering により content 即座に hydrate

**影響範囲**: 12-15ファイル，段階的に 2-3週間かけて実施

**ボリューム**: 各ファイル 1-2 時間，総 20-30 時間の見積

---

### P1-3. cache: "no-store" 多用箇所の見直し

**課題**  
20 箇所の `cache: "no-store"` が毎回のフェッチを強制。

**修正戦略**

- 要件に応じて以下の 3パターンに分類:
  1. **Revalidation ベース**（`next: { revalidate: 60 }` で 1分ごと更新）
  2. **On-demand ISR**（UI で "refresh" ボタン）
  3. **truly mutable**（リアルタイム必須な箇所のみ no-store 継続）

**例: use-month-shifts.ts の hooks（L103）**

```typescript
// before
cache: "no-store",

// after (要件確認後)
// - 月内のシフトは 5分ごと再検証が妥当 → next: { revalidate: 300 }
// - またはユーザー明示的に refresh → on-demand ISR
cache: undefined, // or next: { revalidate: 300 }
```

**検証方法**

- revalidation 間隔を設定後、Network tab で fetch 頻度が減少を確認
- ユーザーが refresh ボタンで明示的に取得も可能

**影響範囲**: hooks, components 内の fetch 20箇所

**ボリューム**: 各箇所 5-15分 × 20 = 2-5 時間

---

## P2: 発展的改善（3-6週間，要件優先度により実施判断）

### P2-1. Google Calendar Sync ジョブキュー化

**課題**  
現在: `after()` でフォアグラウンド実行 → Google API failure/timeout リスク。

**修正内容**

**Option A: 最小限（既存資産活用）**

- 現状 `after()` のまま，リトライ &タイムアウト強化
- ボリューム小, リスク小

**Option B: Proper Job Queue（堅牢）**

- `sync_jobs` table 追加：`{ id, shiftId, type, status, retryCount, lastError }`
- API は DB save + job enqueue のみ同期実行
- Background Worker（または Vercel Cron）が非同期処理
- UI: `sync-status` endpoint で polling

**根拠**

- 複数 Google sync が queue されても serialize 実行
- Dead-letter queue で失敗ジョブを可視化, 手動再実行可能
- timeout, transient error の recovery が堅牢

**実装順序**: P2-2 完了後に要件確認

**ボリューム**: 10-20 時間（schema, worker, UI）

---

### P2-2. 重いフォームコンポーネントの遅延ロード

**課題**  
ShiftForm (1390L), BulkShiftForm (1748L) が毎遷移でロード。

**修正内容**

- `next/dynamic` で lazy load
- フォーム route へ遷移時に parallel prefetch

```typescript
// before
import ShiftForm from "@/components/shifts/ShiftForm";

// after
import dynamic from "next/dynamic";
const ShiftForm = dynamic(() => import("@/components/shifts/ShiftForm"), {
  loading: () => <ShiftFormSkeleton />,
});
```

**根拠（ベストプラクティス）**

- Vercel: `bundle-dynamic-imports` - 大容量コンポーネントを分割 bundle化

**検証方法**

- Build 後 `.next/static/chunks` で bundle サイズ削減を確認
- Lighthouse performance score 改善

**ボリューム**: 各フォーム 30分 × 2 = 1 時間以内

---

## 実装スケジュール（推奨）

| Phase         | 期間     | Task                         | 優先度   | 完了条件                                     |
| ------------- | -------- | ---------------------------- | -------- | -------------------------------------------- |
| **Phase 1**   | Week 1   | P0-1, P0-2, P0-3             | CRITICAL | Lint/TypeScript 通過, dev で体感遅延改善確認 |
| **Phase 1.5** | Week 2   | Verification + User Feedback | MEDIUM   | 本番反映前に外部 UX test                     |
| **Phase 2**   | Week 3-4 | P1-1, P1-2, P1-3             | HIGH     | 遷移時 waterfall 排除確認                    |
| **Phase 3**   | Week 5+  | P2-1, P2-2                   | MEDIUM   | 要件確認後に優先度判定                       |

---

## 実装時の注意事項

1. **Backward Compatibility**
   - API レスポンス形式変更なし（`syncStatus` フィールド追加のみ）
   - 既存クライアントも期待通り動作

2. **Testing**
   - 各 P0 後に `pnpm lint`, `pnpm exec tsc --noEmit` 実行必須
   - Browser dev server で network throttle での動作検証

3. **Rollback Plan**
   - 各ファイル修正後 git commit で細粒度で記録
   - 問題発生時は commit 単位で revert 可能に

4. **Monitoring**
   - Phase 1 実装後，本番環境での `Server-Timing` ヘッダで計測
   - ユーザーフィードバックを定期採集

---

## 関連ドキュメント参照

- [PERFORMANCE_INVESTIGATION_2026-03-19.md](PERFORMANCE_INVESTIGATION_2026-03-19.md)
- [PERFORMANCE_VERIFICATION_2026-03-20.md](PERFORMANCE_VERIFICATION_2026-03-20.md) （Explore 検証結果）
- [AGENTS.md](../AGENTS.md) - MCP, ベストプラクティス方針
- Vercel React Best Practices: `.agents/skills/vercel-react-best-practices/SKILL.md`
- Next.js Official: https://nextjs.org/docs/app/guides/prefetching
