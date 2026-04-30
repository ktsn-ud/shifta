"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type Crumb = {
  title: string;
  href?: string;
};

function dashboardCrumb(withLink: boolean): Crumb {
  if (withLink) {
    return {
      title: "ダッシュボード",
      href: "/my",
    };
  }

  return {
    title: "ダッシュボード",
  };
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  if (pathname === "/my") {
    return [dashboardCrumb(false)];
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "my") {
    return [{ title: "Shifta" }];
  }

  const section = segments[1];
  const root = dashboardCrumb(true);

  if (section === "calendar") {
    return [root, { title: "カレンダー" }];
  }

  if (section === "summary") {
    return [root, { title: "給与サマリー" }];
  }

  if (section === "payroll-details") {
    const subSection = segments[2];

    if (subSection === "workplace-yearly") {
      return [root, { title: "給与詳細" }, { title: "勤務先毎表示" }];
    }

    if (subSection === "monthly" || subSection === undefined) {
      return [root, { title: "給与詳細" }, { title: "月毎表示" }];
    }

    return [root, { title: "給与詳細" }];
  }

  if (section === "calendar-setup") {
    return [root, { title: "カレンダー設定" }];
  }

  if (section === "settings") {
    return [root, { title: "設定" }];
  }

  if (section === "bulk") {
    return [root, { title: "シフト一括登録" }];
  }

  if (section === "workplace") {
    return [root, { title: "勤務先管理" }];
  }

  if (section === "shifts") {
    const action = segments[2];
    if (action === "list") {
      return [root, { title: "シフト一覧" }];
    }
    if (action === "confirm") {
      return [root, { title: "シフト確定" }];
    }
    if (action === "new") {
      return [root, { title: "シフト登録" }];
    }
    if (action === "bulk") {
      return [root, { title: "シフト一括登録" }];
    }
    if (segments[3] === "edit") {
      return [root, { title: "シフト編集" }];
    }
  }

  if (section === "workplaces") {
    const workplaceId = segments[2];
    const workplaceRoot = { title: "勤務先管理", href: "/my/workplaces" };

    if (segments.length === 2) {
      return [root, { title: "勤務先管理" }];
    }

    if (workplaceId === "new") {
      return [root, workplaceRoot, { title: "新規勤務先" }];
    }

    const subsection = segments[3];

    if (subsection === "edit") {
      return [root, workplaceRoot, { title: "勤務先編集" }];
    }

    if (subsection === "payroll-rules") {
      const payrollRulesRoot = {
        title: "給与ルール",
        href: `/my/workplaces/${workplaceId}/payroll-rules`,
      };

      if (segments.length === 4) {
        return [root, workplaceRoot, { title: "給与ルール" }];
      }

      if (segments[4] === "new") {
        return [
          root,
          workplaceRoot,
          payrollRulesRoot,
          { title: "新規給与ルール" },
        ];
      }

      if (segments[5] === "edit") {
        return [
          root,
          workplaceRoot,
          payrollRulesRoot,
          { title: "給与ルール編集" },
        ];
      }
    }

    if (subsection === "timetables") {
      const timetablesRoot = {
        title: "時間割",
        href: `/my/workplaces/${workplaceId}/timetables`,
      };

      if (segments.length === 4) {
        return [root, workplaceRoot, { title: "時間割" }];
      }

      if (segments[4] === "new") {
        return [root, workplaceRoot, timetablesRoot, { title: "新規時間割" }];
      }

      if (segments[5] === "edit") {
        return [root, workplaceRoot, timetablesRoot, { title: "時間割編集" }];
      }
    }
  }

  return [root, { title: "Shifta" }];
}

export function SiteHeader() {
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const key = `${item.title}-${index}`;

              return (
                <Fragment key={key}>
                  {index > 0 ? (
                    <BreadcrumbSeparator key={`${key}-separator`} />
                  ) : null}
                  <BreadcrumbItem>
                    {isLast || item.href === undefined ? (
                      <BreadcrumbPage>{item.title}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={item.href} />}>
                        {item.title}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
