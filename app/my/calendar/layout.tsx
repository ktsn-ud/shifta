import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "カレンダー｜Shifta" },
};

export default function CalendarLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
