import { requireCurrentUser } from "@/lib/api/current-user";
import { syncShiftAfterUpdate } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";

jest.mock("next/server", () => ({
  after: jest.fn(),
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
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/api/current-user", () => ({
  requireCurrentUser: jest.fn(),
}));

jest.mock("@/lib/google-calendar/syncStatus", () => ({
  syncShiftAfterUpdate: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { PATCH } from "@/app/api/shifts/[id]/confirm/route";

const requireCurrentUserMock = jest.mocked(requireCurrentUser);
const syncShiftAfterUpdateMock = jest.mocked(syncShiftAfterUpdate);
const prismaShiftFindFirstMock = jest.mocked(prisma.shift.findFirst);
const prismaShiftUpdateMock = jest.mocked(prisma.shift.update);

function createShiftEntity() {
  return {
    id: "shift-1",
    workplaceId: "workplace-1",
    startTime: new Date("1970-01-01T09:00:00.000Z"),
    endTime: new Date("1970-01-01T17:00:00.000Z"),
    breakMinutes: 60,
    date: new Date("2026-03-18T00:00:00.000Z"),
    comment: null,
    isConfirmed: false,
  };
}

describe("PATCH /api/shifts/[id]/confirm", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireCurrentUserMock.mockResolvedValue({
      user: { id: "user-1" },
    } as Awaited<ReturnType<typeof requireCurrentUser>>);
    prismaShiftFindFirstMock.mockResolvedValue(createShiftEntity());
    prismaShiftUpdateMock.mockResolvedValue({
      ...createShiftEntity(),
      isConfirmed: true,
    });
    syncShiftAfterUpdateMock.mockResolvedValue({
      ok: true,
      googleEventId: "event-1",
    });
  });

  it("rejects when start and end time are the same", async () => {
    const request = new Request("http://localhost/api/shifts/shift-1/confirm", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startTime: "18:00",
        endTime: "18:00",
        breakMinutes: 60,
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "shift-1" }),
    });
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("開始時刻と終了時刻は同じ時刻にできません");
    expect(prismaShiftUpdateMock).not.toHaveBeenCalled();
  });

  it("accepts overnight shift and confirms it", async () => {
    const request = new Request("http://localhost/api/shifts/shift-1/confirm", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startTime: "22:00",
        endTime: "05:00",
        breakMinutes: 30,
      }),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "shift-1" }),
    });

    expect(response.status).toBe(200);
    expect(prismaShiftUpdateMock).toHaveBeenCalled();
  });
});
