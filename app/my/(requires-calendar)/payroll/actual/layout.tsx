import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "実給与編集｜Shifta" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
