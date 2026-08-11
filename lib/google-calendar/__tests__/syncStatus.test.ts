import { revalidateShiftDomainTags } from "@/lib/cache/revalidate";
import { retryShiftSync } from "@/lib/google-calendar/syncStatus";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/cache/revalidate", () => ({
  revalidateShiftDomainTags: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/google-calendar/syncEvent", () => ({
  createCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  getVerifiedCalendarClient: jest.fn(),
  updateCalendarEvent: jest.fn(),
}));

const revalidateShiftDomainTagsMock = jest.mocked(revalidateShiftDomainTags);
const shiftUpdateManyMock = jest.mocked(prisma.shift.updateMany);
const shiftFindFirstMock = jest.mocked(prisma.shift.findFirst);
const userFindUniqueMock = jest.mocked(prisma.user.findUnique);

const { updateCalendarEvent } = jest.requireMock(
  "@/lib/google-calendar/syncEvent",
) as {
  updateCalendarEvent: jest.Mock;
};

describe("retryShiftSync", () => {
  beforeEach(() => {
    jest.resetAllMocks();

    shiftUpdateManyMock.mockResolvedValue({ count: 1 });

    shiftFindFirstMock.mockResolvedValue({
      id: "shift-1",
      workplaceId: "workplace-1",
      googleEventId: "google-event-1",
      workplace: {
        id: "workplace-1",
        userId: "user-1",
        name: "勤務先A",
        color: "#3366FF",
        type: "GENERAL",
      },
      lessonRange: null,
    } as unknown as Awaited<ReturnType<typeof prisma.shift.findFirst>>);
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      calendarId: "calendar-1",
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    updateCalendarEvent.mockResolvedValue(undefined);
  });

  it("同期状態更新のたびにシフト系 cache tag を再検証する", async () => {
    await expect(retryShiftSync("shift-1", "user-1")).resolves.toEqual({
      ok: true,
      googleEventId: "google-event-1",
    });

    expect(shiftUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(shiftUpdateManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "shift-1",
          workplace: {
            userId: "user-1",
          },
        },
      }),
    );
    expect(revalidateShiftDomainTagsMock).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
    });
    expect(revalidateShiftDomainTagsMock).toHaveBeenNthCalledWith(2, {
      userId: "user-1",
    });
  });

  it("所有していない shiftId では同期状態を書き換えない", async () => {
    shiftFindFirstMock.mockResolvedValue(null);

    await expect(retryShiftSync("shift-2", "user-1")).resolves.toEqual({
      ok: false,
      errorMessage: "同期対象のシフトまたはユーザーが見つかりません",
      errorCode: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });

    expect(shiftUpdateManyMock).not.toHaveBeenCalled();
    expect(revalidateShiftDomainTagsMock).not.toHaveBeenCalled();
  });

  it("上流エラーの token/config を同期結果やログに含めない", async () => {
    const error = Object.assign(new Error("raw-token"), {
      response: {
        status: 400,
        config: {
          headers: {
            Authorization: "Bearer raw-token",
          },
        },
      },
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation();
    const infoSpy = jest.spyOn(console, "info").mockImplementation();
    updateCalendarEvent.mockRejectedValue(error);

    await expect(retryShiftSync("shift-1", "user-1")).resolves.toEqual({
      ok: false,
      errorMessage: "Google Calendar との同期に失敗しました",
      errorCode: null,
      requiresCalendarSetup: false,
      requiresSignOut: false,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "Google Calendar shift sync failed",
      expect.objectContaining({
        action: "retry",
        userId: "user-1",
        shiftId: "shift-1",
        error: "Google Calendar との同期に失敗しました",
        errorCode: null,
      }),
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("raw-token");
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("raw-token");
  });
});
