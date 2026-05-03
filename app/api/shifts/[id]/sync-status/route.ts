import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { getOwnedShiftSyncStatus } from "@/lib/google-calendar/syncStatus";
import { jsonNoStore } from "@/lib/api/cache-control";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { id } = await context.params;
    const status = await getOwnedShiftSyncStatus(id, current.user.id);

    if (!status) {
      return jsonError("シフトが見つかりません", 404);
    }

    return jsonNoStore({ data: status });
  } catch (error) {
    console.error("GET /api/shifts/:id/sync-status failed", error);
    return jsonError("同期ステータス取得に失敗しました", 500);
  }
}
