import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { DATE_ONLY_REGEX, parseDateOnly } from "@/lib/api/date-time";
import { jsonError } from "@/lib/api/http";
import { getPayrollSummaryForUser } from "@/lib/payroll/summary";

const summaryQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(DATE_ONLY_REGEX, "startDate は YYYY-MM-DD形式で入力してください"),
    endDate: z
      .string()
      .regex(DATE_ONLY_REGEX, "endDate は YYYY-MM-DD形式で入力してください"),
  })
  .refine(
    (value) => parseDateOnly(value.startDate) <= parseDateOnly(value.endDate),
    {
      message: "startDate は endDate 以下で指定してください",
      path: ["startDate"],
    },
  );

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = summaryQuerySchema.safeParse({
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const startDate = parseDateOnly(query.data.startDate);
    const endDate = parseDateOnly(query.data.endDate);
    const summary = await getPayrollSummaryForUser(
      current.user.id,
      startDate,
      endDate,
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("GET /api/payroll/summary failed", error);
    return jsonError("給与集計の取得に失敗しました", 500);
  }
}
