import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "シフト編集｜Shifta" },
};

export default function EditShiftLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
