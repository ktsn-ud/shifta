import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "給与ルール一覧｜Shifta" },
};

export default function PayrollRulesLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
