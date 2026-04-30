import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "給与詳細｜Shifta" },
};

export default function PayrollDetailsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
