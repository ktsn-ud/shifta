import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { requireCurrentUser } from "@/lib/api/current-user";

export const metadata: Metadata = {
  title: { absolute: "ホーム｜Shifta" },
};

async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  const user = {
    name: current.user.name ?? "ユーザー",
    email: current.user.email,
    avatar: current.user.image,
  };

  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "18rem",
            "--header-height": "4.25rem",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" user={user} />
        <SidebarInset>
          <SiteHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </Suspense>
  );
}
