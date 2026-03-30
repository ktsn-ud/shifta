import type { Session } from "next-auth";
import { calendar_v3, google } from "googleapis";
import {
  getGoogleAuthBySession,
  getGoogleAuthByUserId,
  getGoogleReadAuthByUserId,
} from "./auth";
import {
  SHIFTA_CALENDAR_DESCRIPTION,
  SHIFTA_CALENDAR_NAME,
  SHIFTA_CALENDAR_TIMEZONE,
} from "./constants";

type CalendarAuth = calendar_v3.Options["auth"];

export async function getCalendarClient(
  session: Session,
): Promise<calendar_v3.Calendar> {
  const { oauth2Client } = await getGoogleAuthBySession(session);
  return google.calendar({
    version: "v3",
    auth: oauth2Client,
  });
}

export async function getCalendarClientByUserId(
  userId: string,
): Promise<calendar_v3.Calendar> {
  const { oauth2Client } = await getGoogleAuthByUserId(userId);
  return google.calendar({
    version: "v3",
    auth: oauth2Client,
  });
}

export async function getReadCalendarClientByUserId(
  userId: string,
): Promise<calendar_v3.Calendar> {
  const { oauth2Client } = await getGoogleReadAuthByUserId(userId);
  return google.calendar({
    version: "v3",
    auth: oauth2Client,
  });
}

export async function createShiftaCalendar(
  auth: CalendarAuth,
): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.calendars.insert({
    requestBody: {
      summary: SHIFTA_CALENDAR_NAME,
      description: SHIFTA_CALENDAR_DESCRIPTION,
      timeZone: SHIFTA_CALENDAR_TIMEZONE,
    },
  });

  const calendarId = response.data.id;
  if (!calendarId) {
    throw new Error(
      "Google Calendar の作成結果に calendarId が含まれていません",
    );
  }

  return calendarId;
}
