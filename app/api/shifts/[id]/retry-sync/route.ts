import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { retryShiftSync } from "@/lib/google-calendar/syncStatus";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: Context) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const { id } = await context.params;
    const result = await retryShiftSync(id, current.user.id);

    if (result.ok) {
      return NextResponse.json({
        success: true,
        googleEventId: result.googleEventId,
      });
    }

    return jsonError("Google Calendar の再同期に失敗しました", 502, {
      detail: result.errorMessage,
    });
  } catch (error) {
    console.error("POST /api/shifts/:id/retry-sync failed", error);
    return jsonError("Google Calendar の再同期に失敗しました", 500);
  }
}
