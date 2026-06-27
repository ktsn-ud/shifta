import { connection } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import { jsonNoStore } from "@/lib/api/cache-control";
import { jsonError } from "@/lib/api/http";
import { getPayrollSummaryYearContextForUser } from "@/lib/payroll/summary";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const summaryYearContextQuerySchema = z.strictObject({
  month: z
    .string()
    .regex(MONTH_REGEX, "month は YYYY-MM形式で入力してください"),
});

export async function GET(request: Request) {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = summaryYearContextQuerySchema.safeParse({
      month: url.searchParams.get("month"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const summaryYearContext = await getPayrollSummaryYearContextForUser(
      current.user.id,
      parseDateOnly(`${query.data.month}-01`),
    );

    return jsonNoStore(summaryYearContext, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET /api/payroll/summary-year-context failed", error);
    return jsonError("給与集計の累計情報取得に失敗しました", 500);
  }
}
