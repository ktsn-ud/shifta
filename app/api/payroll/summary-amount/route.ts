import { connection } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import { jsonNoStore } from "@/lib/api/cache-control";
import { jsonError } from "@/lib/api/http";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { getPayrollSummaryAmountForUser } from "@/lib/payroll/summary";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const summaryAmountQuerySchema = z.strictObject({
  month: z
    .string()
    .regex(MONTH_REGEX, "month は YYYY-MM形式で入力してください"),
});

export async function GET(request: Request) {
  const timing = createRequestTiming("GET /api/payroll/summary-amount");

  try {
    await timing.measure("connection", () => connection());
    const current = await timing.measure("auth", () =>
      timing.measure("requireCurrentUser", () => requireCurrentUser()),
    );
    if ("response" in current) {
      return timing.applyServerTiming(current.response);
    }

    const url = new URL(request.url);
    const query = await timing.measure("queryParse", () =>
      summaryAmountQuerySchema.safeParse({
        month: url.searchParams.get("month"),
      }),
    );

    if (!query.success) {
      return timing.applyServerTiming(
        jsonError("クエリパラメータが不正です", 400, query.error.flatten()),
      );
    }

    const summaryAmount = await timing.measure(
      "getPayrollSummaryAmountForUser",
      () =>
        timing.measure("service", () =>
          getPayrollSummaryAmountForUser(
            current.user.id,
            parseDateOnly(`${query.data.month}-01`),
          ),
        ),
    );

    return timing.applyServerTiming(
      jsonNoStore(summaryAmount, {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      }),
    );
  } catch (error) {
    console.error("GET /api/payroll/summary-amount failed", error);
    return timing.applyServerTiming(
      jsonError("次回支給額の取得に失敗しました", 500),
    );
  }
}
