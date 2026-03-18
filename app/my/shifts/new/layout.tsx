import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "シフト新規登録｜Shifta" },
};

export default function NewShiftLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
