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
  CheckCheckIcon,
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
  subItems?: Array<{
    title: string;
    href: string;
  }>;
};

const mainNavItems: NavItem[] = [
  { title: "ダッシュボード", href: "/my", icon: <LayoutDashboardIcon /> },
  {
    title: "シフト一覧",
    href: "/my/shifts/list",
    icon: <ListIcon />,
  },
  {
    title: "シフト確定",
    href: "/my/shifts/confirm",
    icon: <CheckCheckIcon />,
  },
  {
    title: "給与サマリー",
    href: "/my/summary",
    icon: <WalletCardsIcon />,
  },
  {
    title: "給与詳細",
    href: "/my/payroll-details",
    icon: <WalletCardsIcon />,
    subItems: [
      { title: "月毎表示", href: "/my/payroll-details/monthly" },
      { title: "勤務先毎表示", href: "/my/payroll-details/workplace-yearly" },
    ],
  },
  {
    title: "勤務先管理",
    href: "/my/workplaces",
    icon: <LandmarkIcon />,
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/my") {
    return pathname === "/my";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
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
      <SidebarHeader className="border-b border-sidebar-border/70 pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[slot=sidebar-menu-button]:h-11 data-[slot=sidebar-menu-button]:rounded-xl data-[slot=sidebar-menu-button]:px-3 data-[slot=sidebar-menu-button]:font-semibold"
              render={<Link href="/my" />}
              isActive={pathname === "/my"}
              onClick={handleMenuItemClick}
            >
              <CommandIcon className="size-5" />
              <span className="text-base font-semibold">Shifta</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="pt-1">
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActivePath(pathname, item.href)}
                    className="text-sidebar-foreground/90"
                    render={<Link href={item.href} />}
                    onClick={handleMenuItemClick}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.subItems && item.subItems.length > 0 ? (
                    <SidebarMenuSub>
                      {item.subItems.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.href}>
                          <SidebarMenuSubButton
                            isActive={isActivePath(pathname, subItem.href)}
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70 pt-3">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
