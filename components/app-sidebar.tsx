"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  CommandIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListIcon,
  WalletCardsIcon,
} from "lucide-react";

type SidebarUser = {
  name: string;
  email: string;
  avatar?: string | null;
};

type NavItem = {
  title: string;
  href: string;
  icon: React.ReactNode;
  matchHrefs?: string[];
  subItems?: Array<{
    title: string;
    href: string;
    matchHrefs?: string[];
  }>;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "主要メニュー",
    items: [
      {
        title: "ダッシュボード",
        href: "/my",
        icon: <LayoutDashboardIcon />,
      },
      {
        title: "シフト管理",
        href: "/my/shifts/list",
        icon: <ListIcon />,
        matchHrefs: ["/my/shifts", "/my/bulk"],
        subItems: [
          { title: "シフト一覧", href: "/my/shifts/list" },
          { title: "シフト登録", href: "/my/shifts/new" },
          {
            title: "一括登録",
            href: "/my/shifts/bulk",
            matchHrefs: ["/my/bulk"],
          },
          { title: "シフト確定", href: "/my/shifts/confirm" },
        ],
      },
      {
        title: "給与管理",
        href: "/my/summary",
        icon: <WalletCardsIcon />,
        matchHrefs: ["/my/payroll-details"],
        subItems: [
          { title: "給与サマリー", href: "/my/summary" },
          {
            title: "給与詳細（月毎）",
            href: "/my/payroll-details/monthly",
            matchHrefs: ["/my/payroll-details"],
          },
          {
            title: "給与詳細（勤務先毎）",
            href: "/my/payroll-details/workplace-yearly",
          },
        ],
      },
    ],
  },
  {
    label: "設定",
    items: [
      {
        title: "勤務先・ルール",
        href: "/my/workplaces",
        icon: <LandmarkIcon />,
        matchHrefs: ["/my/workplace", "/my/payroll", "/my/timetable"],
        subItems: [
          {
            title: "勤務先管理",
            href: "/my/workplaces",
            matchHrefs: ["/my/workplace"],
          },
          { title: "給与ルール", href: "/my/payroll" },
          { title: "時間割", href: "/my/timetable" },
        ],
      },
    ],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  const normalizedHref =
    href.length > 1 && href.endsWith("/") ? href.slice(0, -1) : href;

  if (normalizedHref === "/my") {
    return normalizedPathname === "/my";
  }

  return (
    normalizedPathname === normalizedHref ||
    normalizedPathname.startsWith(`${normalizedHref}/`)
  );
}

function isSubItemActive(
  pathname: string,
  href: string,
  matchHrefs: string[] = [],
): boolean {
  return (
    isActivePath(pathname, href) ||
    matchHrefs.some((matchHref) => isActivePath(pathname, matchHref))
  );
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (isActivePath(pathname, item.href)) {
    return true;
  }

  if (item.matchHrefs?.some((matchHref) => isActivePath(pathname, matchHref))) {
    return true;
  }

  return (
    item.subItems?.some((subItem) =>
      isSubItemActive(pathname, subItem.href, subItem.matchHrefs),
    ) ?? false
  );
}

function isSubItemClusterActive(pathname: string, item: NavItem): boolean {
  return (
    item.subItems?.some((subItem) =>
      isSubItemActive(pathname, subItem.href, subItem.matchHrefs),
    ) ?? false
  );
}

function shouldShowTopLevelSubLabel(pathname: string, item: NavItem): boolean {
  if (!item.subItems || item.subItems.length === 0) {
    return false;
  }

  return isSubItemClusterActive(pathname, item);
}

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleMenuItemClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-2 border-b border-sidebar-border/70 pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[slot=sidebar-menu-button]:h-12 data-[slot=sidebar-menu-button]:rounded-xl data-[slot=sidebar-menu-button]:px-3 data-[slot=sidebar-menu-button]:font-semibold"
              render={<Link href="/my" />}
              isActive={pathname.startsWith("/my")}
              onClick={handleMenuItemClick}
            >
              <CommandIcon className="size-5" />
              <div className="grid text-left leading-tight">
                <span className="text-base font-semibold">Shifta</span>
                <span className="text-xs text-sidebar-foreground/65">
                  Shift & Payroll
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="pt-1">
        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isItemActive(pathname, item)}
                      className="text-sidebar-foreground/90"
                      render={<Link href={item.href} />}
                      onClick={handleMenuItemClick}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.subItems && item.subItems.length > 0 ? (
                      <SidebarMenuSub
                        className={
                          shouldShowTopLevelSubLabel(pathname, item)
                            ? ""
                            : "opacity-90"
                        }
                      >
                        {item.subItems.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.href}>
                            <SidebarMenuSubButton
                              isActive={isSubItemActive(
                                pathname,
                                subItem.href,
                                subItem.matchHrefs,
                              )}
                              className="text-sidebar-foreground/80"
                              render={<Link href={subItem.href} />}
                              onClick={handleMenuItemClick}
                            >
                              <span>{subItem.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70 pt-3">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
