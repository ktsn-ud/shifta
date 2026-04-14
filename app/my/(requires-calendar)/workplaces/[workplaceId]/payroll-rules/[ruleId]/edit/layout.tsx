import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "給与ルール編集｜Shifta" },
};

export default function EditPayrollRuleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
