"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NavUser } from "@/components/nav-user";
import { useCurrentUserQuery } from "@/lib/query/queries/user";
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
  type LucideIcon,
} from "lucide-react";

type SidebarUser = {
  name: string;
  email: string;
  avatar?: string | null;
};

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
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
        icon: LayoutDashboardIcon,
      },
      {
        title: "シフト管理",
        href: "/my/shifts/list",
        icon: ListIcon,
        matchHrefs: ["/my/shifts", "/my/bulk"],
        subItems: [
          { title: "シフト一覧", href: "/my/shifts/list" },
          { title: "シフト登録", href: "/my/shifts/new" },
          {
            title: "一括登録",
            href: "/my/shifts/bulk",
            matchHrefs: ["/my/bulk"],
          },
          { title: "一括編集", href: "/my/shifts/bulk-edit" },
          { title: "シフト確定", href: "/my/shifts/confirm" },
        ],
      },
      {
        title: "給与管理",
        href: "/my/summary",
        icon: WalletCardsIcon,
        matchHrefs: ["/my/payroll-details", "/my/payroll/actual"],
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
          {
            title: "実給与編集",
            href: "/my/payroll/actual",
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
        icon: LandmarkIcon,
        matchHrefs: ["/my/workplace"],
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

function shouldShowTopLevelSubLabel(pathname: string, item: NavItem): boolean {
  if (!item.subItems || item.subItems.length === 0) {
    return false;
  }

  return item.subItems.some((subItem) =>
    isSubItemActive(pathname, subItem.href, subItem.matchHrefs),
  );
}

function SidebarFooterContent({ user }: { user: SidebarUser }) {
  return <NavUser user={user} />;
}

function SidebarFooterCurrentUser() {
  const { data: currentUser, error } = useCurrentUserQuery();
  const shouldShowPlaceholder = currentUser === undefined && !error;
  const fallbackUser = {
    name: currentUser?.name ?? "ユーザー",
    email: currentUser?.email ?? "user@example.com",
    avatar: currentUser?.image ?? null,
  };

  if (shouldShowPlaceholder) {
    return (
      <div
        aria-label="ユーザー情報を読み込み中"
        className="flex h-12 items-center gap-3 rounded-xl border border-sidebar-border/70 px-2.5"
      >
        <div className="size-8 rounded-md bg-sidebar-accent/50" />
        <div className="grid flex-1 gap-1">
          <div className="h-3 w-20 rounded bg-sidebar-accent/50" />
          <div className="h-2.5 w-28 rounded bg-sidebar-accent/35" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <SidebarFooterContent user={fallbackUser} />
        <p className="px-2.5 text-xs text-sidebar-foreground/70">
          ユーザー情報を更新できません
        </p>
      </div>
    );
  }

  return <SidebarFooterContent user={fallbackUser} />;
}

type PrefetchHandlers = {
  onMouseEnter: () => void;
  onFocus: () => void;
};

function SidebarNavigationRenderer({
  pathname,
  onNavigate,
  createPrefetchHandlers,
}: {
  pathname?: string;
  onNavigate?: () => void;
  createPrefetchHandlers?: (href: string) => PrefetchHandlers;
}) {
  return (
    <>
      {navSections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => {
                const isActive = pathname
                  ? isItemActive(pathname, item)
                  : false;
                const subLabelVisible = pathname
                  ? shouldShowTopLevelSubLabel(pathname, item)
                  : false;
                const topLevelHandlers = createPrefetchHandlers?.(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive}
                      className="text-sidebar-foreground/90"
                      render={<Link href={item.href} prefetch={false} />}
                      {...topLevelHandlers}
                      onClick={onNavigate}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.subItems && item.subItems.length > 0 ? (
                      <SidebarMenuSub
                        className={subLabelVisible ? "" : "opacity-90"}
                      >
                        {item.subItems.map((subItem) => {
                          const subItemHandlers = createPrefetchHandlers?.(
                            subItem.href,
                          );

                          return (
                            <SidebarMenuSubItem key={subItem.href}>
                              <SidebarMenuSubButton
                                isActive={
                                  pathname
                                    ? isSubItemActive(
                                        pathname,
                                        subItem.href,
                                        subItem.matchHrefs,
                                      )
                                    : false
                                }
                                className="text-sidebar-foreground/80"
                                render={
                                  <Link href={subItem.href} prefetch={false} />
                                }
                                {...subItemHandlers}
                                onClick={onNavigate}
                              >
                                <span>{subItem.title}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function SidebarNavigationFallback() {
  return (
    <SidebarContent className="pt-1">
      <SidebarNavigationRenderer />
    </SidebarContent>
  );
}

function SidebarNavigationResolved() {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleMenuItemClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const createPrefetchHandlers = (href: string): PrefetchHandlers => ({
    onMouseEnter: () => router.prefetch(href),
    onFocus: () => router.prefetch(href),
  });

  return (
    <SidebarContent className="pt-1">
      <SidebarNavigationRenderer
        pathname={pathname}
        onNavigate={handleMenuItemClick}
        createPrefetchHandlers={createPrefetchHandlers}
      />
    </SidebarContent>
  );
}

function SidebarHeaderLogo() {
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Link
      href="/my"
      prefetch={false}
      className="flex h-12 items-center gap-3 rounded-xl px-3 text-sidebar-foreground"
      onClick={handleClick}
    >
      <CommandIcon className="size-5" />
      <div className="grid text-left leading-tight">
        <span className="text-base font-semibold">Shifta</span>
        <span className="text-xs text-sidebar-foreground/65">
          Shift & Payroll
        </span>
      </div>
    </Link>
  );
}

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user?: SidebarUser;
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-2 border-b border-sidebar-border/70 pb-4">
        <SidebarHeaderLogo />
      </SidebarHeader>

      <Suspense fallback={<SidebarNavigationFallback />}>
        <SidebarNavigationResolved />
      </Suspense>

      <SidebarFooter className="border-t border-sidebar-border/70 pt-3">
        {user ? (
          <SidebarFooterContent user={user} />
        ) : (
          <SidebarFooterCurrentUser />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
