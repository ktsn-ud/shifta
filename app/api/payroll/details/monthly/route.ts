import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import { jsonError } from "@/lib/api/http";
import { getPayrollDetailsMonthlyForUser } from "@/lib/payroll/details";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthlyQuerySchema = z
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
    const query = monthlyQuerySchema.safeParse({
      month: url.searchParams.get("month"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const monthly = await getPayrollDetailsMonthlyForUser(
      current.user.id,
      parseDateOnly(`${query.data.month}-01`),
    );

    return NextResponse.json(monthly, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET /api/payroll/details/monthly failed", error);
    return jsonError("給与詳細（月毎）の取得に失敗しました", 500);
  }
}
