import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireCurrentUser } from "@/lib/api/current-user";

export const metadata: Metadata = {
  title: { absolute: "カレンダー連携設定｜Shifta" },
};

export default async function CalendarSetupLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  if (current.user.calendarId) {
    redirect("/my");
  }

  return children;
}
