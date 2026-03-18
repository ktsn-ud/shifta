import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "給与ルール新規登録｜Shifta" },
};

export default function NewPayrollRuleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
