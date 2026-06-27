import { after } from "next/server";
import { auth } from "@/lib/auth";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError, verifyMutationRequest } from "@/lib/api/http";
import {
  getGoogleAuthBySession,
  GoogleCalendarAuthError,
} from "@/lib/google-calendar/auth";
import { createShiftaCalendar } from "@/lib/google-calendar/client";
import { buildPendingSyncResponse } from "@/lib/google-calendar/sync-response";
import { syncShiftsAfterBulkCreate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/api/cache-control";

function mapGoogleAuthErrorStatus(error: GoogleCalendarAuthError): number {
  if (error.code === "UNAUTHENTICATED" || error.code === "TOKEN_EXPIRED") {
    return 401;
  }

  if (error.code === "SCOPE_MISSING") {
    return 403;
  }

  return 400;
}

function isTokenExpiredError(error: GoogleCalendarAuthError): boolean {
  return error.code === "TOKEN_EXPIRED";
}

export async function POST(request: Request) {
  try {
    const csrfError = verifyMutationRequest(request);
    if (csrfError) {
      return csrfError;
    }

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

    after(async () => {
      try {
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
        const syncedCount = syncResults.filter((result) => result.ok).length;
        const failedCount = syncResults.length - syncedCount;

        console.info(
          "POST /api/calendar/initialize background sync completed",
          {
            userId: current.user.id,
            total: syncResults.length,
            synced: syncedCount,
            failed: failedCount,
          },
        );
      } catch (error) {
        console.error("POST /api/calendar/initialize background sync failed", {
          userId: current.user.id,
          error,
        });
      }
    });

    return jsonNoStore({
      success: true,
      calendarId,
      sync: buildPendingSyncResponse(),
    });
  } catch (error) {
    if (error instanceof GoogleCalendarAuthError) {
      return jsonError(
        error.message,
        mapGoogleAuthErrorStatus(error),
        isTokenExpiredError(error)
          ? {
              code: error.code,
              requiresSignOut: true,
            }
          : undefined,
        isTokenExpiredError(error)
          ? {
              headers: {
                "Cache-Control": "no-store",
              },
            }
          : undefined,
      );
    }

    console.error("POST /api/calendar/initialize failed", error);
    return jsonError("Googleカレンダー初期化に失敗しました", 500);
  }
}
