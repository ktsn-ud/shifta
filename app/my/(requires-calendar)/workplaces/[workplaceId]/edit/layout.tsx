import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "勤務先編集｜Shifta" },
};

export default function EditWorkplaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
