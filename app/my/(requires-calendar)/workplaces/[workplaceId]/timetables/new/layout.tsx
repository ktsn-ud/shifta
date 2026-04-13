import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "時間割新規登録｜Shifta" },
};

export default function NewTimetableLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
