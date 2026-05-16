"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
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

  switch (section) {
    case "summary":
      return [root, { title: "給与サマリー" }];
    case "payroll-details": {
      const detailRoot = {
        title: "給与詳細",
        href: "/my/payroll-details/monthly",
      };
      const subSection = segments[2];
      if (subSection === "workplace-yearly") {
        return [root, detailRoot, { title: "勤務先毎表示" }];
      }
      if (subSection === "monthly" || subSection === undefined) {
        return [root, detailRoot, { title: "月毎表示" }];
      }
      return [root, detailRoot];
    }
    case "bulk":
      return [root, { title: "シフト一括登録" }];
    case "workplace":
      return [root, { title: "勤務先管理" }];
    case "shifts": {
      const shiftRoot = { title: "シフト管理", href: "/my/shifts/list" };
      const action = segments[2];
      if (action === "list") {
        return [root, shiftRoot, { title: "シフト一覧" }];
      }
      if (action === "confirm") {
        return [root, shiftRoot, { title: "シフト確定" }];
      }
      if (action === "new") {
        return [root, shiftRoot, { title: "シフト登録" }];
      }
      if (action === "bulk") {
        return [root, shiftRoot, { title: "シフト一括登録" }];
      }
      if (segments[3] === "edit") {
        return [root, shiftRoot, { title: "シフト編集" }];
      }
      return [root, shiftRoot];
    }
    case "workplaces": {
      const workplaceId = segments[2];
      const workplaceRoot = { title: "勤務先管理", href: "/my/workplaces" };

      if (segments.length === 2) {
        return [root, workplaceRoot, { title: "勤務先一覧" }];
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
          return [root, workplaceRoot, payrollRulesRoot];
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
          return [root, workplaceRoot, timetablesRoot];
        }

        if (segments[4] === "new") {
          return [root, workplaceRoot, timetablesRoot, { title: "新規時間割" }];
        }

        if (segments[5] === "edit") {
          return [root, workplaceRoot, timetablesRoot, { title: "時間割編集" }];
        }
      }
      return [root, workplaceRoot];
    }
    default:
      return [root, { title: "Shifta" }];
  }
}

export function SiteHeader() {
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);
  const shouldCollapseMiddle = breadcrumbs.length > 3;

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/70 bg-background/90 transition-[width,height] ease-linear backdrop-blur supports-[backdrop-filter]:bg-background/75 group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1 rounded-xl border border-border/70 bg-background shadow-none hover:bg-muted/60" />
        <Separator
          orientation="vertical"
          className="mx-1 h-6 bg-border/80 data-vertical:self-auto"
        />
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="inline-flex min-w-0 items-center rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-sm">
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const isMiddleItem =
                shouldCollapseMiddle &&
                index > 0 &&
                index < breadcrumbs.length - 1;
              const key = `${item.title}-${index}`;
              const separatorClassName = isMiddleItem
                ? "hidden sm:inline-flex"
                : shouldCollapseMiddle && isLast
                  ? "hidden sm:inline-flex"
                  : undefined;
              const itemClassName = isMiddleItem
                ? "hidden sm:inline-flex"
                : undefined;

              return (
                <Fragment key={key}>
                  {index > 0 ? (
                    <BreadcrumbSeparator
                      key={`${key}-separator`}
                      className={separatorClassName}
                    />
                  ) : null}
                  {shouldCollapseMiddle && isLast ? (
                    <Fragment>
                      <BreadcrumbSeparator className="sm:hidden" />
                      <BreadcrumbItem className="sm:hidden">
                        <BreadcrumbEllipsis />
                      </BreadcrumbItem>
                    </Fragment>
                  ) : null}
                  <BreadcrumbItem className={itemClassName}>
                    {isLast || item.href === undefined ? (
                      <BreadcrumbPage className="font-semibold text-foreground">
                        {item.title}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className={itemClassName}
                        render={<Link href={item.href} />}
                      >
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
