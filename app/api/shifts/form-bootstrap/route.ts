import { connection } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/api/current-user";
import { jsonNoStore } from "@/lib/api/cache-control";
import { jsonError } from "@/lib/api/http";
import { prisma } from "@/lib/prisma";

const querySchema = z.strictObject({
  selectedWorkplaceId: z.string().min(1).optional(),
});

function toTimeOnly(value: Date): string {
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function buildTimetableSetsResponse(
  timetableSets: Array<{
    id: string;
    workplaceId: string;
    name: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    timetables: Array<{
      id: string;
      timetableSetId: string;
      period: number;
      startTime: Date;
      endTime: Date;
    }>;
  }>,
) {
  return timetableSets.map((set) => ({
    id: set.id,
    workplaceId: set.workplaceId,
    name: set.name,
    sortOrder: set.sortOrder,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
    items: set.timetables.map((item) => ({
      id: item.id,
      timetableSetId: item.timetableSetId,
      period: item.period,
      startTime: item.startTime.toISOString(),
      endTime: item.endTime.toISOString(),
      startTimeLabel: toTimeOnly(item.startTime),
      endTimeLabel: toTimeOnly(item.endTime),
    })),
  }));
}

export async function GET(request: Request) {
  await connection();

  try {
    const current = await requireCurrentUser();
    if ("response" in current) {
      return current.response;
    }

    const url = new URL(request.url);
    const query = querySchema.safeParse({
      selectedWorkplaceId:
        url.searchParams.get("selectedWorkplaceId") ?? undefined,
    });

    if (!query.success) {
      return jsonError(
        "クエリパラメータが不正です",
        400,
        query.error.flatten(),
      );
    }

    const workplaces = await prisma.workplace.findMany({
      where: {
        userId: current.user.id,
      },
      select: {
        id: true,
        name: true,
        type: true,
        color: true,
        closingDayType: true,
        closingDay: true,
        payday: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const selectedWorkplace =
      workplaces.find(
        (workplace) => workplace.id === query.data.selectedWorkplaceId,
      ) ??
      workplaces[0] ??
      null;

    if (!selectedWorkplace) {
      return jsonNoStore(
        {
          data: {
            workplaces: [],
            selectedWorkplace: null,
            payrollRules: [],
            timetableSets: [],
          },
        },
        {
          headers: {
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    const [payrollRules, timetableSets] = await Promise.all([
      prisma.payrollRule.findMany({
        where: {
          workplaceId: selectedWorkplace.id,
        },
        orderBy: [{ startDate: "desc" }],
      }),
      selectedWorkplace.type === "CRAM_SCHOOL"
        ? prisma.timetableSet.findMany({
            where: {
              workplaceId: selectedWorkplace.id,
            },
            include: {
              timetables: {
                orderBy: {
                  period: "asc",
                },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          })
        : Promise.resolve([]),
    ]);

    return jsonNoStore(
      {
        data: {
          workplaces: workplaces.map((workplace) => ({
            id: workplace.id,
            name: workplace.name,
            type: workplace.type,
            color: workplace.color,
          })),
          selectedWorkplace,
          payrollRules,
          timetableSets: buildTimetableSetsResponse(timetableSets),
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/shifts/form-bootstrap failed", error);
    return jsonError("シフト入力の参照データ取得に失敗しました", 500);
  }
}
