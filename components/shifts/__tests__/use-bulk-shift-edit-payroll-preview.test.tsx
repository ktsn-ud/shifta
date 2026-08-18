import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useBulkShiftEditPayrollPreview } from "@/components/shifts/use-bulk-shift-edit-payroll-preview";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function response(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function createInput() {
  const beforeShifts = [
    {
      temporaryId: "shift-1",
      workplaceId: "workplace-1",
      date: "2026-02-10",
      shiftType: "NORMAL" as const,
      startTime: "09:00",
      endTime: "10:00",
      breakMinutes: 0,
      transportationAllowance: 0,
    },
  ];

  return {
    userId: "user-1",
    beforeShifts,
    afterShifts: [
      {
        ...beforeShifts[0],
        endTime: "11:00",
        transportationAllowance: 480,
      },
    ],
    workplaces: [
      {
        id: "workplace-1",
        closingDayType: "END_OF_MONTH" as const,
        closingDay: null,
        payday: 25,
      },
    ],
    payrollRules: [
      {
        workplaceId: "workplace-1",
        startDate: "2020-01-01",
        endDate: null,
        baseHourlyWage: 1000,
        nightPremiumRate: 0,
        dailyOvertimeThreshold: 8,
        holidayType: "NONE" as const,
      },
    ],
    timetableSets: [],
  };
}

describe("useBulkShiftEditPayrollPreview", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("adds an editable increase to the monthly baseline but excludes actual-payroll coverage from the annual difference", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/payroll/preview-baseline?")) {
        return Promise.resolve(
          response({
            data: {
              months: [
                {
                  month: "2026-03",
                  totalWage: 10000,
                  totalTransportationAllowance: 500,
                  totalAmount: 10500,
                  byWorkplace: [],
                },
              ],
            },
          }),
        );
      }
      if (url.startsWith("/api/payroll/preview-annual?")) {
        return Promise.resolve(
          response({
            data: {
              years: [
                {
                  year: 2026,
                  taxableAmount: 120000,
                  nonTaxableAmount: 10000,
                  totalAmount: 130000,
                },
              ],
              actualPayrollKeys: [
                { workplaceId: "workplace-1", paymentMonth: "2026-03" },
              ],
            },
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useBulkShiftEditPayrollPreview(createInput()),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.months).toEqual([
        expect.objectContaining({
          month: "2026-03",
          baselineTotalAmount: 10500,
          differenceWage: 1000,
          differenceTransportationAllowance: 480,
          differenceTotalAmount: 1480,
          projectedTotalAmount: 11980,
        }),
      ]);
      expect(result.current.years).toEqual([
        expect.objectContaining({
          year: 2026,
          differenceTaxableAmount: 0,
          differenceTotalAmount: 0,
          projectedTaxableAmount: 120000,
          projectedTotalAmount: 130000,
          actualPayrollExcludedCount: 1,
        }),
      ]);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/payroll/preview-baseline?months=2026-03"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/payroll/preview-annual?years=2026",
      expect.anything(),
    );
  });

  it("reports monthly baseline loading while the edited difference remains available", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/payroll/preview-baseline?")) {
        return new Promise<Response>(() => undefined);
      }
      if (url.startsWith("/api/payroll/preview-annual?")) {
        return Promise.resolve(
          response({
            data: {
              years: [
                {
                  year: 2026,
                  taxableAmount: 0,
                  nonTaxableAmount: 0,
                  totalAmount: 0,
                },
              ],
              actualPayrollKeys: [],
            },
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useBulkShiftEditPayrollPreview(createInput()),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.isBaselineLoading).toBe(true);
      expect(result.current.months).toEqual([
        expect.objectContaining({ differenceTotalAmount: 1480 }),
      ]);
    });
  });

  it("clears the preview after all edits are reverted", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/payroll/preview-baseline?")) {
        return Promise.resolve(
          response({
            data: {
              months: [
                {
                  month: "2026-03",
                  totalWage: 0,
                  totalTransportationAllowance: 0,
                  totalAmount: 0,
                  byWorkplace: [],
                },
              ],
            },
          }),
        );
      }
      if (url.startsWith("/api/payroll/preview-annual?")) {
        return Promise.resolve(
          response({
            data: {
              years: [
                {
                  year: 2026,
                  taxableAmount: 0,
                  nonTaxableAmount: 0,
                  totalAmount: 0,
                },
              ],
              actualPayrollKeys: [],
            },
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const input = createInput();
    const queryClient = createQueryClient();
    const { result, rerender } = renderHook(
      ({ beforeShifts, afterShifts }) =>
        useBulkShiftEditPayrollPreview({
          ...input,
          beforeShifts,
          afterShifts,
        }),
      {
        initialProps: {
          beforeShifts: input.beforeShifts,
          afterShifts: input.afterShifts,
        },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(result.current.months).toHaveLength(1));
    rerender({ beforeShifts: [], afterShifts: [] });

    expect(result.current.months).toEqual([]);
    expect(result.current.years).toEqual([]);
    expect(result.current.unresolvedCount).toBe(0);
  });

  it("keeps a difference in the annual projection when the actual-payroll key belongs to another workplace", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/payroll/preview-baseline?")) {
        return Promise.resolve(
          response({
            data: {
              months: [
                {
                  month: "2026-03",
                  totalWage: 0,
                  totalTransportationAllowance: 0,
                  totalAmount: 0,
                  byWorkplace: [],
                },
              ],
            },
          }),
        );
      }
      if (url.startsWith("/api/payroll/preview-annual?")) {
        return Promise.resolve(
          response({
            data: {
              years: [
                {
                  year: 2026,
                  taxableAmount: 50000,
                  nonTaxableAmount: 0,
                  totalAmount: 50000,
                },
              ],
              actualPayrollKeys: [
                { workplaceId: "other-workplace", paymentMonth: "2026-03" },
              ],
            },
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useBulkShiftEditPayrollPreview(createInput()),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.years).toEqual([
        expect.objectContaining({
          differenceTaxableAmount: 1000,
          differenceTotalAmount: 1480,
          projectedTaxableAmount: 51000,
          projectedTotalAmount: 51480,
          actualPayrollExcludedCount: 0,
        }),
      ]);
    });
  });
});
