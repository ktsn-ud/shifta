"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const routeTitles: Array<{ path: string; title: string }> = [
  { path: "/my/calendar", title: "Calendar" },
  { path: "/my/summary", title: "Payroll Summary" },
  { path: "/my/workplaces", title: "Workplace Management" },
  { path: "/my/workplace", title: "Workplace Management" },
  { path: "/my/payroll", title: "Payroll Rules" },
  { path: "/my/timetable", title: "Timetable" },
  { path: "/my/settings", title: "Settings" },
  { path: "/my/bulk", title: "Bulk Registration" },
  { path: "/my", title: "Dashboard" },
];

function getCurrentTitle(pathname: string): string {
  if (pathname.includes("/payroll-rules")) {
    return "Payroll Rules";
  }

  if (pathname.includes("/timetables")) {
    return "Timetable";
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
