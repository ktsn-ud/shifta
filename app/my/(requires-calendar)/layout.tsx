import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/api/current-user";
import { redirectToCalendarSetupIfNeeded } from "@/lib/api/calendar-setup-guard";

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
