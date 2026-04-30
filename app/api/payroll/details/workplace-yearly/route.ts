import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { getPayrollDetailsWorkplaceYearlyForUser } from "@/lib/payroll/details";

const YEAR_REGEX = /^\d{4}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const yearlyQuerySchema = z
  .object({
    year: z
      .string()
      .regex(YEAR_REGEX, "year は YYYY形式で入力してください")
      .transform((value) => Number(value))
      .refine(
        (value) =>
          Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR,
        `year は ${MIN_YEAR}〜${MAX_YEAR} の範囲で入力してください`,
      ),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = yearlyQuerySchema.safeParse({
      year: url.searchParams.get("year"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const yearly = await getPayrollDetailsWorkplaceYearlyForUser(
      current.user.id,
      query.data.year,
    );

    return NextResponse.json(yearly);
  } catch (error) {
    console.error("GET /api/payroll/details/workplace-yearly failed", error);
    return jsonError("給与詳細（勤務先毎）の取得に失敗しました", 500);
  }
}
