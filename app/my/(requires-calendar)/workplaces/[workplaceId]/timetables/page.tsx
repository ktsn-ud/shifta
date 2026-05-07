import { notFound, redirect } from "next/navigation";
import { TimetableList } from "@/components/workplaces/timetable-list";
import { requireCurrentUser } from "@/lib/api/current-user";
import { prisma } from "@/lib/prisma";

type TimetableListPageParams = {
  workplaceId: string;
};

type TimetableListPageProps = {
  params: TimetableListPageParams | Promise<TimetableListPageParams>;
};

export default async function TimetableListPage({
  params,
}: TimetableListPageProps) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const resolvedParams = await params;
  const workplace = await prisma.workplace.findFirst({
    where: {
      id: resolvedParams.workplaceId,
      userId: current.user.id,
    },
    select: {
      id: true,
      name: true,
      type: true,
      color: true,
    },
  });

  if (!workplace) {
    notFound();
  }

  const initialTimetables =
    workplace.type === "CRAM_SCHOOL"
      ? (
          await prisma.timetableSet.findMany({
            where: {
              workplaceId: workplace.id,
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
        ).map((set) => ({
          id: set.id,
          workplaceId: set.workplaceId,
          name: set.name,
          sortOrder: set.sortOrder,
          createdAt: set.createdAt.toISOString(),
          updatedAt: set.updatedAt.toISOString(),
          items: set.timetables.map((item) => {
            const startHour = String(item.startTime.getUTCHours()).padStart(
              2,
              "0",
            );
            const startMinute = String(item.startTime.getUTCMinutes()).padStart(
              2,
              "0",
            );
            const endHour = String(item.endTime.getUTCHours()).padStart(2, "0");
            const endMinute = String(item.endTime.getUTCMinutes()).padStart(
              2,
              "0",
            );

            return {
              id: item.id,
              timetableSetId: item.timetableSetId,
              period: item.period,
              startTime: item.startTime.toISOString(),
              endTime: item.endTime.toISOString(),
              startTimeLabel: `${startHour}:${startMinute}`,
              endTimeLabel: `${endHour}:${endMinute}`,
            };
          }),
        }))
      : [];

  return (
    <TimetableList
      workplaceId={workplace.id}
      initialWorkplace={workplace}
      initialTimetables={initialTimetables}
    />
  );
}
