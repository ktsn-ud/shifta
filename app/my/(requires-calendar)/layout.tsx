import { redirect } from "next/navigation";
import { Suspense } from "react";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";
import { SpinnerPanel } from "@/components/ui/spinner";

export default function RequiresCalendarLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<RequiresCalendarFallback />}>
      <RequiresCalendarContent>{children}</RequiresCalendarContent>
    </Suspense>
  );
}

function RequiresCalendarFallback() {
  return (
    <section className="p-4 md:p-6">
      <SpinnerPanel className="min-h-[320px]" label="ページを読み込み中..." />
    </section>
  );
}

async function RequiresCalendarContent({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  await redirectToCalendarSetupIfNeeded(current.user);
  return children;
}
