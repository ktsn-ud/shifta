import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "シフト確定｜Shifta" },
};

export default function ShiftConfirmLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
