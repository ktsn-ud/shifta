import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "給与詳細（月毎表示）｜Shifta" },
};

export default function PayrollDetailsMonthlyLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
