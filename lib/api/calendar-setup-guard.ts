import { redirect } from "next/navigation";
import { type User } from "@/lib/generated/prisma/client";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";

type CalendarSetupGuardUser = Pick<User, "calendarId">;

export async function redirectToCalendarSetupIfNeeded(
  user: CalendarSetupGuardUser,
): Promise<void> {
  if (user.calendarId) {
    return;
  }

  redirect(CALENDAR_SETUP_PATH);
}
