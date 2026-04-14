import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "シフト一覧｜Shifta" },
};

export default function ShiftListLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
