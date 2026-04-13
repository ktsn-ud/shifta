import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "時間割一覧｜Shifta" },
};

export default function TimetablesLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
