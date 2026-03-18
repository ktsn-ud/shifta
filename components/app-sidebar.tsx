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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  CalendarDaysIcon,
  CommandIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  SchoolIcon,
  Settings2Icon,
  TablePropertiesIcon,
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
};

const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/my", icon: <LayoutDashboardIcon /> },
  { title: "Calendar", href: "/my/calendar", icon: <CalendarDaysIcon /> },
  {
    title: "Payroll Summary",
    href: "/my/summary",
    icon: <WalletCardsIcon />,
  },
  {
    title: "Workplace Management",
    href: "/my/workplace",
    icon: <LandmarkIcon />,
  },
  {
    title: "Payroll Rules",
    href: "/my/payroll",
    icon: <TablePropertiesIcon />,
  },
  { title: "Timetable", href: "/my/timetable", icon: <SchoolIcon /> },
];

const secondaryNavItems: NavItem[] = [
  { title: "Settings", href: "/my/settings", icon: <Settings2Icon /> },
  {
    title: "Bulk Registration",
    href: "/my/bulk",
    icon: <CalendarDaysIcon />,
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

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/my" prefetch={false} />}
              isActive={pathname === "/my"}
            >
              <CommandIcon className="size-5" />
              <span className="text-base font-semibold">Shifta</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActivePath(pathname, item.href)}
                    render={<Link href={item.href} prefetch={false} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActivePath(pathname, item.href)}
                    render={<Link href={item.href} prefetch={false} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
