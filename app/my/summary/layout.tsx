import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "給与サマリー｜Shifta" },
};

export default function SummaryLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
