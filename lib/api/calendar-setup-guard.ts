import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type User } from "@/lib/generated/prisma/client";
import {
  CALENDAR_SETUP_PATH,
  CALENDAR_SETUP_SKIP_COOKIE,
} from "@/lib/google-calendar/constants";

type CalendarSetupGuardUser = Pick<User, "calendarId">;

export async function redirectToCalendarSetupIfNeeded(
  user: CalendarSetupGuardUser,
): Promise<void> {
  if (user.calendarId) {
    return;
  }

  const cookieStore = await cookies();
  const skipSetup = cookieStore.get(CALENDAR_SETUP_SKIP_COOKIE)?.value === "1";

  if (skipSetup) {
    return;
  }

  redirect(CALENDAR_SETUP_PATH);
}
