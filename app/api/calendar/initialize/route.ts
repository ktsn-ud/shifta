import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import {
  getGoogleAuthBySession,
  GoogleCalendarAuthError,
} from "@/lib/google-calendar/auth";
import { createShiftaCalendar } from "@/lib/google-calendar/client";
import { CALENDAR_SETUP_SKIP_COOKIE } from "@/lib/google-calendar/constants";
import { syncShiftsAfterBulkCreate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";

function mapGoogleAuthErrorStatus(error: GoogleCalendarAuthError): number {
  if (error.code === "UNAUTHENTICATED") {
    return 401;
  }

  if (error.code === "SCOPE_MISSING") {
    return 403;
  }

  return 400;
}

export async function POST() {
  try {
    const session = await auth();
    if (!session) {
      return jsonError("認証が必要です", 401);
    }

    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    if (current.user.calendarId) {
      return jsonError("カレンダーは既に設定済みです", 409);
    }

    const { oauth2Client } = await getGoogleAuthBySession(session);
    const calendarId = await createShiftaCalendar(oauth2Client);

    const account = await prisma.account.findFirst({
      where: {
        userId: current.user.id,
        provider: "google",
      },
      select: {
        expires_at: true,
      },
    });

    await prisma.user.update({
      where: { id: current.user.id },
      data: {
        calendarId,
        googleTokenExpiresAt: account?.expires_at
          ? new Date(account.expires_at * 1000)
          : current.user.googleTokenExpiresAt,
      },
    });

    const ownedShiftIds = await prisma.shift.findMany({
      where: {
        workplace: {
          userId: current.user.id,
        },
      },
      select: {
        id: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    const syncResults = await syncShiftsAfterBulkCreate(
      ownedShiftIds.map((shift) => shift.id),
      current.user.id,
    );
    const successCount = syncResults.filter((result) => result.ok).length;
    const failedCount = syncResults.length - successCount;

    const response = NextResponse.json({
      success: true,
      calendarId,
      sync: {
        total: syncResults.length,
        success: successCount,
        failed: failedCount,
      },
    });

    response.cookies.set(CALENDAR_SETUP_SKIP_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    if (error instanceof GoogleCalendarAuthError) {
      return jsonError(error.message, mapGoogleAuthErrorStatus(error));
    }

    console.error("POST /api/calendar/initialize failed", error);
    return jsonError("Googleカレンダー初期化に失敗しました", 500);
  }
}
