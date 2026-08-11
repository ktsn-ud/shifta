/**
 * @jest-environment node
 */

import { getReadCalendarClientByUserId } from "@/lib/google-calendar/client";

jest.mock("@/lib/google-calendar/client", () => ({
  getReadCalendarClientByUserId: jest.fn(),
}));

type CalendarClientMock = Awaited<
  ReturnType<typeof getReadCalendarClientByUserId>
>;

const getReadCalendarClientByUserIdMock = jest.mocked(
  getReadCalendarClientByUserId,
);

type CalendarClientControls = {
  colorsGet: jest.Mock;
  calendarListList: jest.Mock;
  eventsList: jest.Mock;
  client: CalendarClientMock;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createCalendarClient(
  overrides: Partial<
    Pick<
      CalendarClientControls,
      "colorsGet" | "calendarListList" | "eventsList"
    >
  > = {},
): CalendarClientControls {
  const colorsGet =
    overrides.colorsGet ??
    jest.fn().mockResolvedValue({
      data: { calendar: {}, event: {} },
    });
  const calendarListList =
    overrides.calendarListList ??
    jest.fn().mockResolvedValue({
      data: {
        items: [
          { id: "calendar-1", summary: "勤務", backgroundColor: "#336699" },
          { id: "calendar-2", summary: "個人", backgroundColor: "#993366" },
        ],
      },
    });
  const eventsList =
    overrides.eventsList ??
    jest.fn().mockResolvedValue({
      data: { items: [] },
    });

  return {
    colorsGet,
    calendarListList,
    eventsList,
    client: {
      colors: { get: colorsGet },
      calendarList: { list: calendarListList },
      events: { list: eventsList },
    } as unknown as CalendarClientMock,
  };
}

async function loadCalendarEventsModule() {
  let calendarEventsModule: typeof import("@/lib/google-calendar/calendar-events");

  await jest.isolateModulesAsync(async () => {
    calendarEventsModule =
      await import("@/lib/google-calendar/calendar-events");
  });

  return calendarEventsModule!;
}

describe("calendar events service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("月の境界をJST範囲として解決し、不正な月を拒否する", async () => {
    const { parseCalendarEventsMonth } = await loadCalendarEventsModule();

    expect(parseCalendarEventsMonth("2026-12")).toEqual({
      month: "2026-12",
      startDateKey: "2026-12-01",
      endDateKeyExclusive: "2027-01-01",
      timeMin: "2026-12-01T00:00:00+09:00",
      timeMax: "2027-01-01T00:00:00+09:00",
    });
    expect(parseCalendarEventsMonth("2026-00")).toBeNull();
    expect(parseCalendarEventsMonth("2026-13")).toBeNull();
    expect(parseCalendarEventsMonth("2026-5")).toBeNull();
    expect(parseCalendarEventsMonth(null)).toBeNull();
  });

  it("選択カレンダーIDをtrim、重複除去、ソートして10件に制限する", async () => {
    const { normalizeRequestedCalendarIds } = await loadCalendarEventsModule();
    const values = [
      " cal-10 ",
      "",
      "cal-02",
      "cal-10",
      "  ",
      "cal-01",
      "cal-03",
      "cal-04",
      "cal-05",
      "cal-06",
      "cal-07",
      "cal-08",
      "cal-09",
      "cal-11",
    ];

    expect(normalizeRequestedCalendarIds(values)).toEqual([
      "cal-01",
      "cal-02",
      "cal-03",
      "cal-04",
      "cal-05",
      "cal-06",
      "cal-07",
      "cal-08",
      "cal-09",
      "cal-10",
    ]);
  });

  it("ユーザー、月、正規化済み選択ごとにキャッシュキーを分離する", async () => {
    const { getCalendarEventsCacheKey } = await loadCalendarEventsModule();

    const baseline = getCalendarEventsCacheKey("user-1", "2026-05", [
      "calendar-a",
      "calendar-b",
    ]);

    expect(
      getCalendarEventsCacheKey("user-2", "2026-05", [
        "calendar-a",
        "calendar-b",
      ]),
    ).not.toBe(baseline);
    expect(
      getCalendarEventsCacheKey("user-1", "2026-06", [
        "calendar-a",
        "calendar-b",
      ]),
    ).not.toBe(baseline);
    expect(
      getCalendarEventsCacheKey("user-1", "2026-05", [
        "calendar-b",
        "calendar-a",
      ]),
    ).not.toBe(baseline);
    expect(getCalendarEventsCacheKey("user-1", "2026-05", [])).toBe(
      getCalendarEventsCacheKey("user-1", "2026-05", []),
    );
  });

  it("同一キーの同時live取得を共有し、レスポンス後の書き込みまではliveを返す", async () => {
    const service = await loadCalendarEventsModule();
    const calendarClient = createCalendarClient();
    const client = createDeferred<CalendarClientMock>();
    getReadCalendarClientByUserIdMock.mockReturnValue(client.promise);
    const range = service.parseCalendarEventsMonth("2026-05");
    if (!range) throw new Error("expected valid month range");
    const request = {
      userId: "user-1",
      range,
      requestedCalendarIds: ["calendar-1"],
    };

    const firstRequest = service.getCalendarEvents(request);
    const secondRequest = service.getCalendarEvents(request);

    expect(getReadCalendarClientByUserIdMock).toHaveBeenCalledTimes(1);
    client.resolve(calendarClient.client);

    const [first, second] = await Promise.all([firstRequest, secondRequest]);
    first.writeCacheAfterResponse();
    const hit = await service.getCalendarEvents({
      userId: "user-1",
      range,
      requestedCalendarIds: ["calendar-1"],
    });

    expect(first.cacheStatus).toBe("live");
    expect(second.cacheStatus).toBe("live");
    expect(second.data).toEqual(first.data);
    expect(hit.cacheStatus).toBe("hit");
    expect(calendarClient.eventsList).toHaveBeenCalledTimes(1);
    expect(getReadCalendarClientByUserIdMock).toHaveBeenCalledTimes(1);
  });

  it("失敗した同一キーのlive取得を共有し、完了後は再試行できる", async () => {
    const service = await loadCalendarEventsModule();
    const failedClient = createDeferred<CalendarClientMock>();
    const error = new Error("Google Calendar unavailable");
    getReadCalendarClientByUserIdMock.mockReturnValueOnce(failedClient.promise);
    const range = service.parseCalendarEventsMonth("2026-05");
    if (!range) throw new Error("expected valid month range");
    const request = {
      userId: "user-1",
      range,
      requestedCalendarIds: ["calendar-1"],
    };

    const firstRequest = service.getCalendarEvents(request);
    const secondRequest = service.getCalendarEvents(request);
    const firstFailure = expect(firstRequest).rejects.toBe(error);
    const secondFailure = expect(secondRequest).rejects.toBe(error);

    expect(getReadCalendarClientByUserIdMock).toHaveBeenCalledTimes(1);
    failedClient.reject(error);
    await Promise.all([firstFailure, secondFailure]);

    const calendarClient = createCalendarClient();
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);
    const retry = await service.getCalendarEvents(request);

    expect(retry.cacheStatus).toBe("live");
    expect(getReadCalendarClientByUserIdMock).toHaveBeenCalledTimes(2);
    expect(calendarClient.eventsList).toHaveBeenCalledTimes(1);
  });

  it("ユーザー、月、選択が異なる同時live取得は独立して開始する", async () => {
    const service = await loadCalendarEventsModule();
    const calendarClient = createCalendarClient();
    const clients = [
      createDeferred<CalendarClientMock>(),
      createDeferred<CalendarClientMock>(),
      createDeferred<CalendarClientMock>(),
      createDeferred<CalendarClientMock>(),
    ];
    let clientIndex = 0;
    getReadCalendarClientByUserIdMock.mockImplementation(
      () => clients[clientIndex++]!.promise,
    );
    const mayRange = service.parseCalendarEventsMonth("2026-05");
    const juneRange = service.parseCalendarEventsMonth("2026-06");
    if (!mayRange || !juneRange) throw new Error("expected valid month ranges");

    const resultsPromise = Promise.all([
      service.getCalendarEvents({
        userId: "user-1",
        range: mayRange,
        requestedCalendarIds: ["calendar-1"],
      }),
      service.getCalendarEvents({
        userId: "user-2",
        range: mayRange,
        requestedCalendarIds: ["calendar-1"],
      }),
      service.getCalendarEvents({
        userId: "user-1",
        range: juneRange,
        requestedCalendarIds: ["calendar-1"],
      }),
      service.getCalendarEvents({
        userId: "user-1",
        range: mayRange,
        requestedCalendarIds: ["calendar-2"],
      }),
    ]);

    expect(getReadCalendarClientByUserIdMock).toHaveBeenCalledTimes(4);
    for (const client of clients) client.resolve(calendarClient.client);
    const [sameKey, differentUser, differentMonth, differentSelection] =
      await resultsPromise;

    expect(new Set([sameKey.cacheKey, differentUser.cacheKey]).size).toBe(2);
    expect(new Set([sameKey.cacheKey, differentMonth.cacheKey]).size).toBe(2);
    expect(new Set([sameKey.cacheKey, differentSelection.cacheKey]).size).toBe(
      2,
    );
    expect(differentUser.data.month).toBe("2026-05");
    expect(differentMonth.data.month).toBe("2026-06");
    expect(differentSelection.data.selectedCalendarIds).toEqual(["calendar-2"]);
    expect(calendarClient.eventsList).toHaveBeenCalledTimes(4);
  });

  it("fresh、stale、期限切れのキャッシュを区別する", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
    const service = await loadCalendarEventsModule();
    const calendarClient = createCalendarClient();
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);
    const range = service.parseCalendarEventsMonth("2026-05");
    if (!range) throw new Error("expected valid month range");
    const request = {
      userId: "user-1",
      range,
      requestedCalendarIds: ["calendar-1"],
    };

    const live = await service.getCalendarEvents(request);
    live.writeCacheAfterResponse();
    const fresh = await service.getCalendarEvents(request);

    jest.advanceTimersByTime(60_000);
    const revalidated = await service.getCalendarEvents(request);
    const stale = service.getStaleCalendarEvents(live.cacheKey);

    jest.advanceTimersByTime(5 * 60_000);
    const expired = service.getStaleCalendarEvents(live.cacheKey);

    expect(fresh.cacheStatus).toBe("hit");
    expect(revalidated.cacheStatus).toBe("live");
    expect(stale).toEqual(live.data);
    expect(expired).toBeNull();
  });

  it("Google APIエラーからstatus、response.status、codeを安全に取り出す", async () => {
    const { extractGoogleCalendarErrorStatus } =
      await loadCalendarEventsModule();

    expect(
      extractGoogleCalendarErrorStatus(
        Object.assign(new Error("rate limited"), { status: 429 }),
      ),
    ).toBe(429);
    expect(
      extractGoogleCalendarErrorStatus(
        Object.assign(new Error("upstream"), { response: { status: 503 } }),
      ),
    ).toBe(503);
    expect(
      extractGoogleCalendarErrorStatus(
        Object.assign(new Error("not found"), { code: "404" }),
      ),
    ).toBe(404);
    expect(extractGoogleCalendarErrorStatus({ status: 500 })).toBeNull();
  });

  it("Google APIの403理由をscope、再試行、アクセス拒否に分類する", async () => {
    const { classifyGoogleCalendarError } = await loadCalendarEventsModule();
    const withResponseReasons = (reasons: string[]) =>
      Object.assign(new Error("Google API request failed"), {
        response: {
          data: { error: { errors: reasons.map((reason) => ({ reason })) } },
        },
      });
    const withCauseReasons = (reasons: string[]) =>
      Object.assign(new Error("Google API request failed"), {
        cause: { errors: reasons.map((reason) => ({ reason })) },
      });

    expect(
      classifyGoogleCalendarError(withResponseReasons(["quotaExceeded"]), 403),
    ).toBe("retryable");
    expect(
      classifyGoogleCalendarError(
        withCauseReasons(["userRateLimitExceeded"]),
        403,
      ),
    ).toBe("retryable");
    expect(
      classifyGoogleCalendarError(
        withResponseReasons(["insufficientPermissions"]),
        403,
      ),
    ).toBe("oauthScopeMissing");
    expect(
      classifyGoogleCalendarError(
        withResponseReasons(["insufficientAuthenticationScopes"]),
        403,
      ),
    ).toBe("oauthScopeMissing");
    expect(
      classifyGoogleCalendarError(withResponseReasons(["forbidden"]), 403),
    ).toBe("accessDenied");
    expect(classifyGoogleCalendarError(withResponseReasons(["acl"]), 403)).toBe(
      "accessDenied",
    );
    expect(classifyGoogleCalendarError(withResponseReasons([]), 403)).toBe(
      "accessDenied",
    );
  });

  it("ページングしたカレンダーとイベントを集約し、月内だけの終日予定を返す", async () => {
    const service = await loadCalendarEventsModule();
    const calendarListList = jest.fn(({ pageToken }: { pageToken?: string }) =>
      Promise.resolve(
        pageToken
          ? {
              data: {
                items: [
                  {
                    id: "calendar-2",
                    colorId: "calendar-color",
                  },
                ],
              },
            }
          : {
              data: {
                items: [{ id: "calendar-1", summary: "勤務" }],
                nextPageToken: "next-calendars",
              },
            },
      ),
    );
    const eventsList = jest.fn(({ pageToken }: { pageToken?: string }) =>
      Promise.resolve(
        pageToken
          ? {
              data: {
                items: [
                  {
                    summary: "  ",
                    start: { dateTime: "2026-05-02T00:00:00+09:00" },
                    end: { dateTime: "not-a-date" },
                  },
                ],
              },
            }
          : {
              data: {
                items: [
                  {
                    summary: "連休",
                    colorId: "event-color",
                    start: { date: "2026-04-30" },
                    end: { date: "2026-05-03" },
                  },
                  {
                    summary: "取消済み",
                    status: "cancelled",
                    start: { date: "2026-05-02" },
                    end: { date: "2026-05-03" },
                  },
                  {
                    summary: "JST時刻",
                    start: { dateTime: "2026-04-30T15:30:00.000Z" },
                    end: { dateTime: "2026-04-30T16:30:00.000Z" },
                  },
                  {
                    summary: "壊れた開始時刻",
                    start: { dateTime: "not-a-date" },
                  },
                ],
                nextPageToken: "next-events",
              },
            },
      ),
    );
    const calendarClient = createCalendarClient({
      colorsGet: jest.fn().mockResolvedValue({
        data: {
          calendar: { "calendar-color": { background: "#aabbcc" } },
          event: { "event-color": { background: "#010203" } },
        },
      }),
      calendarListList,
      eventsList,
    });
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);
    const range = service.parseCalendarEventsMonth("2026-05");
    if (!range) throw new Error("expected valid month range");

    const result = await service.getCalendarEvents({
      userId: "user-1",
      range,
      requestedCalendarIds: ["calendar-2"],
    });

    expect(calendarListList).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pageToken: undefined, maxResults: 250 }),
    );
    expect(calendarListList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageToken: "next-calendars" }),
    );
    expect(eventsList).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        calendarId: "calendar-2",
        pageToken: undefined,
        timeMin: "2026-05-01T00:00:00+09:00",
        timeMax: "2026-06-01T00:00:00+09:00",
      }),
    );
    expect(eventsList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageToken: "next-events" }),
    );
    expect(result.data).toMatchObject({
      selectedCalendarIds: ["calendar-2"],
      calendars: [
        { id: "calendar-1", summary: "勤務", color: null },
        { id: "calendar-2", summary: "(タイトルなし)", color: "#AABBCC" },
      ],
      dates: [
        {
          date: "2026-05-01",
          count: 2,
          items: [
            expect.objectContaining({
              title: "連休",
              allDay: true,
              calendarColor: "#010203",
            }),
            expect.objectContaining({
              title: "JST時刻",
              start: "00:30",
              end: "01:30",
              allDay: false,
              calendarColor: "#AABBCC",
            }),
          ],
        },
        {
          date: "2026-05-02",
          count: 2,
          items: [
            expect.objectContaining({ title: "連休", allDay: true }),
            expect.objectContaining({ title: "(タイトルなし)", end: "" }),
          ],
        },
      ],
    });
  });

  it("未定義のイベント色はカレンダー色にフォールバックし、色がなければnullにする", async () => {
    const service = await loadCalendarEventsModule();
    const calendarClient = createCalendarClient({
      colorsGet: jest.fn().mockResolvedValue({
        data: { calendar: {}, event: {} },
      }),
      calendarListList: jest.fn().mockResolvedValue({
        data: {
          items: [
            { id: "calendar-without-color", summary: "色なし" },
            {
              id: "calendar-with-color",
              summary: "色あり",
              backgroundColor: "#445566",
            },
          ],
        },
      }),
      eventsList: jest.fn(({ calendarId }: { calendarId: string }) =>
        Promise.resolve({
          data: {
            items: [
              {
                summary: calendarId,
                colorId: "unknown-event-color",
                start: { date: "2026-05-10" },
                end: { date: "2026-05-11" },
              },
            ],
          },
        }),
      ),
    });
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);
    const range = service.parseCalendarEventsMonth("2026-05");
    if (!range) throw new Error("expected valid month range");

    const result = await service.getCalendarEvents({
      userId: "user-1",
      range,
      requestedCalendarIds: ["calendar-without-color", "calendar-with-color"],
    });

    expect(result.data.calendars).toEqual([
      { id: "calendar-without-color", summary: "色なし", color: null },
      { id: "calendar-with-color", summary: "色あり", color: "#445566" },
    ]);
    expect(result.data.dates[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          calendarId: "calendar-without-color",
          calendarColor: null,
        }),
        expect.objectContaining({
          calendarId: "calendar-with-color",
          calendarColor: "#445566",
        }),
      ]),
    );
  });

  it("選択指定がない場合は先頭の3カレンダーだけを既定で取得する", async () => {
    const service = await loadCalendarEventsModule();
    const calendarClient = createCalendarClient({
      calendarListList: jest.fn().mockResolvedValue({
        data: {
          items: Array.from({ length: 4 }, (_, index) => ({
            id: `calendar-${index + 1}`,
            summary: `カレンダー ${index + 1}`,
          })),
        },
      }),
    });
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);
    const range = service.parseCalendarEventsMonth("2026-05");
    if (!range) throw new Error("expected valid month range");

    const result = await service.getCalendarEvents({
      userId: "user-1",
      range,
      requestedCalendarIds: [],
    });

    expect(result.data.selectedCalendarIds).toEqual([
      "calendar-1",
      "calendar-2",
      "calendar-3",
    ]);
    expect(calendarClient.eventsList).toHaveBeenCalledTimes(3);
    expect(calendarClient.eventsList).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "calendar-1" }),
    );
    expect(calendarClient.eventsList).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "calendar-2" }),
    );
    expect(calendarClient.eventsList).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "calendar-3" }),
    );
  });

  it("1日の件数は全件保持し、表示アイテムだけを20件に制限する", async () => {
    const service = await loadCalendarEventsModule();
    const calendarClient = createCalendarClient({
      eventsList: jest.fn().mockResolvedValue({
        data: {
          items: Array.from({ length: 21 }, (_, index) => ({
            summary: `予定 ${index + 1}`,
            start: { date: "2026-05-10" },
            end: { date: "2026-05-11" },
          })),
        },
      }),
    });
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);
    const range = service.parseCalendarEventsMonth("2026-05");
    if (!range) throw new Error("expected valid month range");

    const result = await service.getCalendarEvents({
      userId: "user-1",
      range,
      requestedCalendarIds: ["calendar-1"],
    });

    expect(result.data.dates).toEqual([
      expect.objectContaining({
        date: "2026-05-10",
        count: 21,
        items: expect.arrayContaining([
          expect.objectContaining({ title: "予定 1" }),
          expect.objectContaining({ title: "予定 20" }),
        ]),
      }),
    ]);
    expect(result.data.dates[0].items).toHaveLength(20);
    expect(result.data.dates[0].items).not.toContainEqual(
      expect.objectContaining({ title: "予定 21" }),
    );
  });
});
