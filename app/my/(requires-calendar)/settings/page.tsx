import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: { absolute: "設定｜Shifta" },
};

export default function SettingsPage() {
  redirect("/my");
}
