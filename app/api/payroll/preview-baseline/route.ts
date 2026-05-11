import { connection } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { jsonNoStore } from "@/lib/api/cache-control";
import { getPayrollPreviewBaselineForUser } from "@/lib/payroll/preview-baseline";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MONTHS = 12;

const previewBaselineQuerySchema = z
  .object({
    months: z
      .string()
      .min(1, "months は1件以上指定してください")
      .transform((value) => value.split(",").map((item) => item.trim()))
      .pipe(
        z
          .array(
            z
              .string()
              .regex(MONTH_REGEX, "months は YYYY-MM 形式で入力してください"),
          )
          .min(1)
          .max(MAX_MONTHS),
      ),
  })
  .strict();

function normalizeMonths(months: string[]): string[] {
  return Array.from(new Set(months)).sort((left, right) =>
    left.localeCompare(right),
  );
}

export async function GET(request: Request) {
  await connection();

  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = previewBaselineQuerySchema.safeParse({
      months: url.searchParams.get("months"),
    });
    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const result = await getPayrollPreviewBaselineForUser(
      current.user.id,
      normalizeMonths(query.data.months),
    );

    return jsonNoStore(result, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET /api/payroll/preview-baseline failed", error);
    return jsonError("プレビュー用支給見込の取得に失敗しました", 500);
  }
}
