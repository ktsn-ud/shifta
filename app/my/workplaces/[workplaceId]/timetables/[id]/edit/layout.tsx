import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "時間割編集｜Shifta" },
};

export default function EditTimetableLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
