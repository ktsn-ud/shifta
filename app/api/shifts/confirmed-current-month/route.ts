import { connection } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonNoStore } from "@/lib/api/cache-control";
import { jsonError } from "@/lib/api/http";
import { getConfirmedCurrentMonthShiftApiItems } from "@/lib/shifts/confirmation-data";

export async function GET() {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const shifts = await getConfirmedCurrentMonthShiftApiItems(current.user.id);

    return jsonNoStore({
      shifts,
    });
  } catch (error) {
    console.error("GET /api/shifts/confirmed-current-month failed", error);
    return jsonError("確定済みシフトの取得に失敗しました", 500);
  }
}
