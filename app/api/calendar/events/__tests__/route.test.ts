import { getReadCalendarClientByUserId } from "@/lib/google-calendar/client";
import { requireCurrentUser } from "@/lib/api/current-user";

const connectionMock = jest.fn<Promise<void>, []>();
const afterCallbacks: Array<() => void | Promise<void>> = [];

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      body: unknown,
      init?: {
        status?: number;
        headers?: Record<string, string>;
      },
    ) => {
      const headers = new Map(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );

      return {
        status: init?.status ?? 200,
        headers: {
          get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        },
        json: async () => body,
      };
    },
  },
  after: (callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  },
  connection: () => connectionMock(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/google-calendar/client", () => ({
  getReadCalendarClientByUserId: jest.fn(),
}));

type CalendarClientMock = Awaited<
  ReturnType<typeof getReadCalendarClientByUserId>
>;

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const getReadCalendarClientByUserIdMock = jest.mocked(
  getReadCalendarClientByUserId,
);

function createCalendarClientMock() {
  const colorsGet = jest.fn().mockResolvedValue({
    data: {
      calendar: {},
      event: {},
    },
  });
  const calendarListList = jest.fn().mockResolvedValue({
    data: {
      items: [
        {
          id: "calendar-1",
          summary: "å¤å",
          backgroundColor: "#336699",
        },
      ],
    },
  });
  const eventsList = jest.fn().mockResolvedValue({
    data: {
      items: [
        {
          summary: "ååã·ãã",
          start: {
            dateTime: "2026-05-02T09:00:00+09:00",
          },
          end: {
            dateTime: "2026-05-02T12:00:00+09:00",
          },
        },
      ],
    },
  });

  return {
    client: {
      colors: { get: colorsGet },
      calendarList: { list: calendarListList },
      events: { list: eventsList },
    } as unknown as CalendarClientMock,
    calendarListList,
    eventsList,
  };
}

async function loadRouteModule() {
  let routeModule: typeof import("@/app/api/calendar/events/route");

  await jest.isolateModulesAsync(async () => {
    routeModule = await import("@/app/api/calendar/events/route");
  });

  return routeModule!;
}

function buildRequest(method: "GET" | "POST"): Request {
  return {
    method,
    url: "http://localhost/api/calendar/events?month=2026-05",
    headers: {
      get: (name: string) => {
        if (method === "POST" && name.toLowerCase() === "origin") {
          return "http://localhost";
        }

        return null;
      },
    },
  } as Request;
}

async function flushAfterCallbacks() {
  const callbacks = afterCallbacks.splice(0, afterCallbacks.length);

  for (const callback of callbacks) {
    await callback();
  }
}

describe("POST /api/calendar/events", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
    afterCallbacks.length = 0;
  });

  it("ã¬ã¹ãã³ã¹å¾ callback å®è¡åã¯ live ãè¿ãç¶ãã", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const calendarClient = createCalendarClientMock();
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);

    const { POST } = await loadRouteModule();
    const request = buildRequest("POST");

    const firstResponse = await POST(request);
    if (!firstResponse) {
      throw new Error("firstResponse is undefined");
    }
    const firstPayload = (await firstResponse.json()) as {
      meta: { cacheStatus: string };
    };

    const secondResponse = await POST(request);
    if (!secondResponse) {
      throw new Error("secondResponse is undefined");
    }
    const secondPayload = (await secondResponse.json()) as {
      meta: { cacheStatus: string };
    };

    expect(firstPayload.meta.cacheStatus).toBe("live");
    expect(secondPayload.meta.cacheStatus).toBe("live");
    expect(calendarClient.calendarListList).toHaveBeenCalledTimes(2);
    expect(calendarClient.eventsList).toHaveBeenCalledTimes(2);
    expect(afterCallbacks).toHaveLength(2);
  });

  it("ã¬ã¹ãã³ã¹å¾ callback å®è¡å¾ã¯ hit ãè¿ã", async () => {
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);

    const calendarClient = createCalendarClientMock();
    getReadCalendarClientByUserIdMock.mockResolvedValue(calendarClient.client);

    const { POST } = await loadRouteModule();
    const request = buildRequest("POST");

    const firstResponse = await POST(request);
    if (!firstResponse) {
      throw new Error("firstResponse is undefined");
    }
    const firstPayload = (await firstResponse.json()) as {
      meta: { cacheStatus: string };
    };
    await flushAfterCallbacks();

    const secondResponse = await POST(request);
    if (!secondResponse) {
      throw new Error("secondResponse is undefined");
    }
    const secondPayload = (await secondResponse.json()) as {
      meta: { cacheStatus: string };
    };

    expect(firstPayload.meta.cacheStatus).toBe("live");
    expect(secondPayload.meta.cacheStatus).toBe("hit");
    expect(calendarClient.calendarListList).toHaveBeenCalledTimes(1);
    expect(calendarClient.eventsList).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/calendar/events", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    connectionMock.mockResolvedValue(undefined);
    afterCallbacks.length = 0;
  });

  it("405 と Allow: POST を返す", async () => {
    const { GET } = await loadRouteModule();

    const response = await GET();
    if (!response) {
      throw new Error("response is undefined");
    }

    const payload = (await response.json()) as {
      error: string;
    };

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(payload.error).toBe("このエンドポイントはPOSTのみ対応しています");
  });
});
