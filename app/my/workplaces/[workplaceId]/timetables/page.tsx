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

  const timetables =
    workplace.type === "CRAM_SCHOOL"
      ? await prisma.timetable.findMany({
          where: { workplaceId: workplace.id },
          orderBy: [{ type: "asc" }, { period: "asc" }],
        })
      : [];

  const initialTimetables = timetables.map((timetable) => ({
    id: timetable.id,
    workplaceId: timetable.workplaceId,
    type: timetable.type,
    period: timetable.period,
    startTime: timetable.startTime.toISOString(),
    endTime: timetable.endTime.toISOString(),
  }));

  return (
    <TimetableList
      workplaceId={workplace.id}
      initialWorkplace={workplace}
      initialTimetables={initialTimetables}
    />
  );
}
