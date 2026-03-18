import type { Metadata } from "next";
import { WorkplaceList } from "@/components/workplaces/workplace-list";

export const metadata: Metadata = {
  title: { absolute: "勤務先一覧｜Shifta" },
};

export default function WorkplacesPage() {
  return <WorkplaceList />;
}
