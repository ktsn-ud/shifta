import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadPayrollSnapshot } from "@/lib/payroll/snapshot";

jest.mock("react", () => ({
  cache: <T>(fn: T) => fn,
}));

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    workplace: {
      findMany: jest.fn(),
    },
  },
}));

const cacheLifeMock = jest.mocked(cacheLife);
const cacheTagMock = jest.mocked(cacheTag);
const workplaceFindManyMock = jest.mocked(prisma.workplace.findMany);

describe("payroll snapshot cache tags", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    workplaceFindManyMock.mockResolvedValue([]);
  });

  it("tags a requested month with both its broad user snapshot and its specific month", async () => {
    await loadPayrollSnapshot({
      userId: "user-1",
      monthDates: [new Date("2026-04-01T00:00:00.000Z")],
    });

    expect(cacheLifeMock).toHaveBeenCalledWith("minutes");
    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:payroll-snapshot",
      "user:user-1:payroll-snapshot:2026-04",
    );
  });

  it("tags every distinct requested month for the annual twelve-month snapshot", async () => {
    await loadPayrollSnapshot({
      userId: "user-1",
      monthDates: Array.from(
        { length: 12 },
        (_, month) => new Date(Date.UTC(2026, month, 1)),
      ),
    });

    expect(cacheTagMock).toHaveBeenCalledWith(
      "user:user-1:payroll-snapshot",
      ...Array.from(
        { length: 12 },
        (_, month) =>
          `user:user-1:payroll-snapshot:2026-${String(month + 1).padStart(2, "0")}`,
      ),
    );
  });
});
