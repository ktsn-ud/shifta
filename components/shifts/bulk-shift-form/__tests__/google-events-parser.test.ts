import { parseGoogleCalendarEventsResponse } from "@/components/shifts/bulk-shift-form/google-events-parser";

function createResponsePayload() {
  return {
    data: {
      month: "2026-03",
      calendars: [
        {
          id: "calendar-1",
          summary: "個人",
          color: "#3366FF",
        },
      ],
      selectedCalendarIds: ["calendar-1"],
      dates: [
        {
          date: "2026-03-20",
          count: 1,
          items: [
            {
              title: "研究室MTG",
              start: "10:00",
              end: "11:00",
              allDay: false,
              calendarId: "calendar-1",
              calendarSummary: "個人",
              calendarColor: "#3366FF",
            },
          ],
        },
      ],
    },
  };
}

describe("parseGoogleCalendarEventsResponse", () => {
  it("parses a valid calendar events DTO", () => {
    const payload = createResponsePayload();

    expect(parseGoogleCalendarEventsResponse(payload)).toEqual({
      ...payload.data,
      cacheWarning: null,
    });
  });

  it.each([
    ["month", { data: { ...createResponsePayload().data, month: "March" } }],
    [
      "calendar",
      {
        data: {
          ...createResponsePayload().data,
          calendars: [{ id: "calendar-1", summary: 1, color: null }],
        },
      },
    ],
    [
      "date",
      {
        data: {
          ...createResponsePayload().data,
          dates: [{ date: "2026/03/20", count: 0, items: [] }],
        },
      },
    ],
    [
      "event item",
      {
        data: {
          ...createResponsePayload().data,
          dates: [
            {
              ...createResponsePayload().data.dates[0],
              items: [
                {
                  ...createResponsePayload().data.dates[0].items[0],
                  allDay: "false",
                },
              ],
            },
          ],
        },
      },
    ],
  ])("returns null for an invalid %s", (_field, payload) => {
    expect(parseGoogleCalendarEventsResponse(payload)).toBeNull();
  });

  it("returns null when selected calendar IDs are not strings", () => {
    const payload = {
      data: {
        ...createResponsePayload().data,
        selectedCalendarIds: ["calendar-1", 2],
      },
    };

    expect(parseGoogleCalendarEventsResponse(payload)).toBeNull();
  });

  it("accepts an empty calendar result with a zero event count", () => {
    const payload = createResponsePayload();
    payload.data.calendars = [];
    payload.data.selectedCalendarIds = [];
    payload.data.dates = [{ date: "2026-03-20", count: 0, items: [] }];

    expect(parseGoogleCalendarEventsResponse(payload)).toEqual({
      ...payload.data,
      cacheWarning: null,
    });
  });

  it("preserves a stale-cache warning supplied by the API", () => {
    const payload = {
      ...createResponsePayload(),
      meta: {
        cacheStatus: "stale",
        warning: "直近の取得結果を表示しています。",
      },
    };

    expect(parseGoogleCalendarEventsResponse(payload)?.cacheWarning).toBe(
      "直近の取得結果を表示しています。",
    );
  });

  it("uses the stale-cache fallback warning when the API does not supply one", () => {
    const payload = {
      ...createResponsePayload(),
      meta: { cacheStatus: "stale" },
    };

    expect(parseGoogleCalendarEventsResponse(payload)?.cacheWarning).toBe(
      "Google予定は最新でない可能性があります。",
    );
  });
});
