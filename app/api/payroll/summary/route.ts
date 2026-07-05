import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonNoStore } from "@/lib/api/cache-control";
import { jsonError } from "@/lib/api/http";
import { createRequestTiming } from "@/lib/perf/request-timing";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const summaryQuerySchema = z.strictObject({
  year: z
    .string()
    .regex(/^\d{4}$/, "year は YYYY形式で入力してください")
    .transform((value) => Number(value))
    .refine(
      (value) =>
        Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR,
      `year は ${MIN_YEAR}〜${MAX_YEAR} の範囲で入力してください`,
    ),
});

export async function GET(request: Request) {
  const timing = createRequestTiming("GET /api/payroll/summary");

  try {
    timing.startStep("connection");
    try {
      await connection();
    } finally {
      timing.endStep("connection");
    }
    const current = await timing.measure("auth", () =>
      timing.measure("requireCurrentUser", () => requireCurrentUser()),
    );
    if ("response" in current) {
      return timing.applyServerTiming(current.response);
    }

    const url = new URL(request.url);
    const query = await timing.measure("queryParse", () =>
      summaryQuerySchema.safeParse({
        year: url.searchParams.get("year"),
      }),
    );

    if (!query.success) {
      return timing.applyServerTiming(
        jsonError("クエリパラメータが不正です", 400, query.error.flatten()),
      );
    }

    const summary = await timing.measure("getPayrollSummaryForUser", () =>
      timing.measure("service", () =>
        getPayrollSummaryForUser(current.user.id, query.data.year),
      ),
    );

    return timing.applyServerTiming(
      jsonNoStore(summary, {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      }),
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("GET /api/payroll/summary failed", error);
    return timing.applyServerTiming(
      jsonError("給与集計の取得に失敗しました", 500),
    );
  }
}
