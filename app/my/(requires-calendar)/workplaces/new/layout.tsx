import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "勤務先新規登録｜Shifta" },
};

export default function NewWorkplaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
