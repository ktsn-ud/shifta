import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorkplaceList } from "@/components/workplaces/workplace-list";
import { requireCurrentUser } from "@/lib/api/current-user";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: { absolute: "勤務先一覧｜Shifta" },
};

export default async function WorkplacesPage() {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const workplaces = await prisma.workplace.findMany({
    where: { userId: current.user.id },
    include: {
      _count: {
        select: {
          shifts: true,
          payrollRules: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const timetableSetCounts = await Promise.all(
    workplaces.map(async (workplace) => {
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM "TimetableSet"
        WHERE "workplaceId" = ${workplace.id}
      `;

      return [workplace.id, rows[0]?.count ?? 0] as const;
    }),
  );
  const timetableSetCountByWorkplaceId = new Map(timetableSetCounts);

  const initialWorkplaces = workplaces.map((workplace) => ({
    id: workplace.id,
    name: workplace.name,
    type: workplace.type,
    color: workplace.color,
    _count: {
      shifts: workplace._count.shifts,
      payrollRules: workplace._count.payrollRules,
      timetableSets: timetableSetCountByWorkplaceId.get(workplace.id) ?? 0,
    },
  }));

  return <WorkplaceList initialWorkplaces={initialWorkplaces} />;
}
