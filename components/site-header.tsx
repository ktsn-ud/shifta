"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const routeTitles: Array<{ path: string; title: string }> = [
  { path: "/my/calendar", title: "カレンダー" },
  { path: "/my/summary", title: "給与サマリー" },
  { path: "/my/workplaces", title: "勤務先管理" },
  { path: "/my/workplace", title: "勤務先管理" },
  { path: "/my/bulk", title: "一括登録" },
  { path: "/my/shifts/bulk", title: "一括登録" },
  { path: "/my", title: "ダッシュボード" },
];

function getCurrentTitle(pathname: string): string {
  if (pathname.includes("/payroll-rules")) {
    return "給与ルール";
  }

  if (pathname.includes("/timetables")) {
    return "時間割";
  }

  const matched = routeTitles.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  );

  return matched?.title ?? "Shifta";
}

export function SiteHeader() {
  const pathname = usePathname();
  const title = getCurrentTitle(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  );
}
