import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "カレンダー連携設定｜Shifta" },
};

export default function CalendarSetupLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
