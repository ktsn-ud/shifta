import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "給与詳細（勤務先毎表示）｜Shifta" },
};

export default function PayrollDetailsWorkplaceYearlyLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
