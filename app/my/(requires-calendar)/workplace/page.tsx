import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: { absolute: "勤務先｜Shifta" },
};

export default function WorkplaceLegacyPage() {
  redirect("/my/workplaces");
}
