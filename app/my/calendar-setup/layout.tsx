import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { requireCurrentUser } from "@/lib/api/current-user";
import Loading from "./loading";

export const metadata: Metadata = {
  title: { absolute: "カレンダー連携設定｜Shifta" },
};

export default function CalendarSetupLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<Loading />}>
      <CalendarSetupContent>{children}</CalendarSetupContent>
    </Suspense>
  );
}

async function CalendarSetupContent({
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
