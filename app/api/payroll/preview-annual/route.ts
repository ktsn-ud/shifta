import { connection } from "next/server";
import { z } from "zod";
import { jsonNoStore } from "@/lib/api/cache-control";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonError } from "@/lib/api/http";
import { getPayrollAnnualPreviewForUser } from "@/lib/payroll/preview-annual";

const querySchema = z.strictObject({
  years: z
    .string()
    .min(1)
    .transform((value) => value.split(",").map((item) => item.trim()))
    .pipe(
      z
        .array(
          z
            .string()
            .regex(/^\d{4}$/)
            .transform(Number)
            .pipe(z.number().int().min(2000).max(2100)),
        )
        .min(1)
        .max(12),
    ),
});

export async function GET(request: Request) {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) return current.response;
    const query = querySchema.safeParse({
      years: new URL(request.url).searchParams.get("years"),
    });
    if (!query.success)
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    const years = Array.from(new Set(query.data.years)).sort(
      (left, right) => left - right,
    );
    const result = await getPayrollAnnualPreviewForUser(current.user.id, years);
    return jsonNoStore(result);
  } catch (error) {
    console.error("GET /api/payroll/preview-annual failed", error);
    return jsonError("年間支給見込の取得に失敗しました", 500);
  }
}
