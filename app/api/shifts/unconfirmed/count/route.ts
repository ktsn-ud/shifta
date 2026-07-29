import { connection } from "next/server";
import { jsonNoStore } from "@/lib/api/cache-control";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { getUnconfirmedShiftCount } from "@/lib/shifts/unconfirmed-count";

export async function GET() {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const count = await getUnconfirmedShiftCount(current.user.id);

    return jsonNoStore({ count });
  } catch (error) {
    console.error("GET /api/shifts/unconfirmed/count failed", error);
    return jsonError("未確定シフト件数の取得に失敗しました", 500);
  }
}
