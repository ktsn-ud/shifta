import { after, connection } from "next/server";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError, verifyMutationRequest } from "@/lib/api/http";
import { jsonNoStore } from "@/lib/api/cache-control";
import { GoogleCalendarAuthError } from "@/lib/google-calendar/auth";
import {
  classifyGoogleCalendarError,
  extractGoogleCalendarErrorStatus,
  getCalendarEventsCacheKey,
  getCalendarEvents,
  getStaleCalendarEvents,
  normalizeRequestedCalendarIds,
  parseCalendarEventsMonth,
} from "@/lib/google-calendar/calendar-events";

function mapGoogleAuthErrorStatus(error: GoogleCalendarAuthError): number {
  if (error.code === "UNAUTHENTICATED" || error.code === "TOKEN_EXPIRED")
    return 401;
  if (error.code === "SCOPE_MISSING" || error.code === "READ_SCOPE_MISSING")
    return 403;
  return 400;
}
function isTokenExpiredError(error: GoogleCalendarAuthError): boolean {
  return error.code === "TOKEN_EXPIRED";
}

function createGoogleAuthErrorResponse(error: GoogleCalendarAuthError) {
  const details: Record<string, unknown> = { code: error.code };
  if (error.code === "READ_SCOPE_MISSING") details.requiresReconsent = true;
  if (isTokenExpiredError(error)) details.requiresSignOut = true;
  return jsonError(
    error.message,
    mapGoogleAuthErrorStatus(error),
    details,
    isTokenExpiredError(error)
      ? { headers: { "Cache-Control": "no-store" } }
      : undefined,
  );
}

function createUpstreamGoogleTokenExpiredError(): GoogleCalendarAuthError {
  return new GoogleCalendarAuthError(
    "TOKEN_EXPIRED",
    "Googleトークンの有効期限が切れています。再ログインしてください",
  );
}

function createUpstreamGoogleScopeMissingError(): GoogleCalendarAuthError {
  return new GoogleCalendarAuthError(
    "READ_SCOPE_MISSING",
    "全カレンダー予定表示に必要なGoogle権限が不足しています。再ログインして再同意してください",
  );
}

function getSafeGoogleErrorLog(
  error: unknown,
  status: number | null,
): Record<string, string | number | null> {
  const rawCode =
    error instanceof Error &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
      ? error.code
      : null;
  const code =
    typeof rawCode === "number" && Number.isFinite(rawCode)
      ? rawCode
      : typeof rawCode === "string" && /^[A-Z0-9_]{1,64}$/.test(rawCode)
        ? rawCode
        : null;

  return {
    name: "GoogleCalendarRequestError",
    status,
    code,
    message: "Google Calendar API request failed",
  };
}

async function handleCalendarEventsRequest(request: Request) {
  await connection();
  let cacheKey: string | null = null;
  try {
    const current = await requireCurrentUser();
    if ("response" in current) return current.response;
    const url = new URL(request.url);
    const range = parseCalendarEventsMonth(url.searchParams.get("month"));
    if (!range)
      return jsonError("month は YYYY-MM 形式で指定してください", 400);
    const requestedCalendarIds = normalizeRequestedCalendarIds(
      url.searchParams.getAll("calendarId"),
    );
    cacheKey = getCalendarEventsCacheKey(
      current.user.id,
      range.month,
      requestedCalendarIds,
    );
    const result = await getCalendarEvents({
      userId: current.user.id,
      range,
      requestedCalendarIds,
    });
    after(result.writeCacheAfterResponse);
    return jsonNoStore({
      data: result.data,
      meta: { cacheStatus: result.cacheStatus },
    });
  } catch (error) {
    if (error instanceof GoogleCalendarAuthError) {
      return createGoogleAuthErrorResponse(error);
    }
    const status = extractGoogleCalendarErrorStatus(error);
    if (status !== null) {
      if (status === 401) {
        return createGoogleAuthErrorResponse(
          createUpstreamGoogleTokenExpiredError(),
        );
      }

      const classification = classifyGoogleCalendarError(error, status);
      if (classification === "oauthScopeMissing") {
        return createGoogleAuthErrorResponse(
          createUpstreamGoogleScopeMissingError(),
        );
      }

      const staleData =
        classification === "retryable"
          ? cacheKey
            ? getStaleCalendarEvents(cacheKey)
            : null
          : null;
      if (staleData) {
        console.warn("POST /api/calendar/events fallback to stale cache", {
          ...getSafeGoogleErrorLog(error, status),
        });
        return jsonNoStore({
          data: staleData,
          meta: {
            cacheStatus: "stale",
            warning:
              "Google Calendar の最新予定を取得できなかったため、直近の取得結果を表示しています。",
          },
        });
      }
      console.error("POST /api/calendar/events google api failed", {
        ...getSafeGoogleErrorLog(error, status),
      });
      return jsonError(
        "Google Calendar の予定取得に失敗しました。時間を置いて再度お試しください",
        502,
      );
    }
    console.error(
      "POST /api/calendar/events failed",
      getSafeGoogleErrorLog(error, null),
    );
    return jsonError("Google Calendar 予定の取得に失敗しました", 500);
  }
}

export function GET() {
  return jsonError(
    "このエンドポイントはPOSTのみ対応しています",
    405,
    undefined,
    { headers: { Allow: "POST" } },
  );
}
export async function POST(request: Request) {
  const csrfError = verifyMutationRequest(request);
  return csrfError ?? handleCalendarEventsRequest(request);
}
