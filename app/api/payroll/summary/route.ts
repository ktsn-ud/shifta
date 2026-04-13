import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import { jsonError } from "@/lib/api/http";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const summaryQuerySchema = z
  .object({
    month: z
      .string()
      .regex(MONTH_REGEX, "month は YYYY-MM形式で入力してください"),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = summaryQuerySchema.safeParse({
      month: url.searchParams.get("month"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const summary = await getPayrollSummaryForUser(
      current.user.id,
      parseDateOnly(`${query.data.month}-01`),
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("GET /api/payroll/summary failed", error);
    return jsonError("給与集計の取得に失敗しました", 500);
  }
}
