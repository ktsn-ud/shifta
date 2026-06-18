import { connection } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { parseDateOnly } from "@/lib/api/date-time";
import { jsonNoStore } from "@/lib/api/cache-control";
import { jsonError } from "@/lib/api/http";
import { revalidateActualPayrollDomainTags } from "@/lib/cache/revalidate";
import { getActualPayrollEditorForUser } from "@/lib/payroll/actual-editor";
import { prisma } from "@/lib/prisma";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const actualPayrollQuerySchema = z
  .object({
    month: z
      .string()
      .regex(MONTH_REGEX, "month は YYYY-MM形式で入力してください"),
  })
  .strict();

const actualPayrollRowSchema = z
  .object({
    workplaceId: z.string().min(1),
    taxableAmount: z.number().finite().min(0).nullable(),
    nonTaxableAmount: z.number().finite().min(0).nullable(),
    note: z.string().max(200).nullable().optional(),
  })
  .strict();

const actualPayrollBodySchema = z
  .object({
    rows: z.array(actualPayrollRowSchema),
  })
  .strict();

function normalizeNote(note: string | null | undefined): string | null {
  const normalized = note?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export async function GET(request: Request) {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = actualPayrollQuerySchema.safeParse({
      month: url.searchParams.get("month"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const result = await getActualPayrollEditorForUser(
      current.user.id,
      parseDateOnly(`${query.data.month}-01`),
    );

    return jsonNoStore(result, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET /api/payroll/actual failed", error);
    return jsonError("実給与の取得に失敗しました", 500);
  }
}

export async function PUT(request: Request) {
  await connection();
  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = actualPayrollQuerySchema.safeParse({
      month: url.searchParams.get("month"),
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const payload = actualPayrollBodySchema.safeParse(await request.json());
    if (!payload.success) {
      return jsonError(
        "リクエストボディが不正です",
        400,
        payload.error.flatten(),
      );
    }

    const paymentMonth = parseDateOnly(`${query.data.month}-01`);
    const workplaces = await prisma.workplace.findMany({
      where: {
        userId: current.user.id,
      },
      select: {
        id: true,
      },
    });
    const allowedWorkplaceIds = new Set(
      workplaces.map((workplace) => workplace.id),
    );

    for (const row of payload.data.rows) {
      if (!allowedWorkplaceIds.has(row.workplaceId)) {
        return jsonError("対象の勤務先が見つかりません", 404);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const row of payload.data.rows) {
        const note = normalizeNote(row.note);
        const shouldDelete =
          row.taxableAmount === null && row.nonTaxableAmount === null && !note;

        if (shouldDelete) {
          await tx.actualPayroll.deleteMany({
            where: {
              workplaceId: row.workplaceId,
              paymentMonth,
            },
          });
          continue;
        }

        const taxableAmount = row.taxableAmount ?? 0;
        const nonTaxableAmount = row.nonTaxableAmount ?? 0;

        await tx.actualPayroll.upsert({
          where: {
            workplaceId_paymentMonth: {
              workplaceId: row.workplaceId,
              paymentMonth,
            },
          },
          update: {
            taxableAmount,
            nonTaxableAmount,
            note,
          },
          create: {
            workplaceId: row.workplaceId,
            paymentMonth,
            taxableAmount,
            nonTaxableAmount,
            note,
          },
        });
      }
    });

    revalidateActualPayrollDomainTags({ userId: current.user.id });

    const result = await getActualPayrollEditorForUser(
      current.user.id,
      paymentMonth,
    );

    return jsonNoStore(
      {
        data: result,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("PUT /api/payroll/actual failed", error);
    return jsonError("実給与の保存に失敗しました", 500);
  }
}
