import { redirect } from "next/navigation";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";
import { requireCurrentUser } from "@/lib/api/current-user";

export default async function RequiresCalendarLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const current = await requireCurrentUser();
  if ("response" in current) {
    redirect("/login");
  }

  await redirectToCalendarSetupIfNeeded(current.user);
  return children;
}
