import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    actualPayroll: {
      findMany: jest.fn(),
    },
  },
}));

import { getActualPayrollMap } from "@/lib/payroll/actual-payroll";

const prismaActualPayrollFindManyMock = jest.mocked(
  prisma.actualPayroll.findMany,
);

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe("getActualPayrollMap", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("対象月を range ではなく exact month の in で問い合わせる", async () => {
    prismaActualPayrollFindManyMock.mockResolvedValue([
      {
        workplaceId: "workplace-1",
        paymentMonth: date("2026-03-01"),
        taxableAmount: new Prisma.Decimal(1000),
        nonTaxableAmount: new Prisma.Decimal(200),
        note: null,
      },
    ] as never);

    const result = await getActualPayrollMap({
      workplaceIds: ["workplace-1"],
      monthKeys: ["2026-03", "2026-01", "2026-03"],
    });

    expect(prismaActualPayrollFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workplaceId: {
            in: ["workplace-1"],
          },
          paymentMonth: {
            in: [date("2026-03-01"), date("2026-01-01")],
          },
        }),
      }),
    );
    expect(result.get("workplace-1:2026-03")).toEqual({
      taxableAmount: 1000,
      nonTaxableAmount: 200,
      totalAmount: 1200,
      note: null,
    });
  });
});
