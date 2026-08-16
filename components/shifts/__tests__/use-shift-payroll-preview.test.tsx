import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useShiftPayrollPreview } from "@/components/shifts/use-shift-payroll-preview";

const requestedYears = [2026, 2027];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function createMockResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function createAnnualPayload(years: number[]) {
  return {
    data: {
      years: years.map((year) => ({
        year,
        taxableAmount: year * 100,
        nonTaxableAmount: year,
        totalAmount: year * 101,
      })),
    },
  };
}

function createPreviewInput() {
  return {
    userId: "user-1",
    shifts: [
      {
        temporaryId: "shift-2026",
        workplaceId: "workplace-1",
        date: "2026-01-15",
        shiftType: "NORMAL" as const,
        startTime: "09:00",
        endTime: "10:00",
        breakMinutes: 0,
      },
      {
        temporaryId: "shift-2027",
        workplaceId: "workplace-1",
        date: "2027-01-15",
        shiftType: "NORMAL" as const,
        startTime: "09:00",
        endTime: "10:00",
        breakMinutes: 0,
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
        baseHourlyWage: 1200,
        nightPremiumRate: 0,
        dailyOvertimeThreshold: 8,
        holidayType: "NONE" as const,
      },
    ],
    timetableSets: [],
  };
}

describe("useShiftPayrollPreview annual response coverage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockPreviewFetch(annualPayload: unknown) {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/payroll/preview-baseline?")) {
        const months = new URL(url, "http://localhost").searchParams
          .get("months")
          ?.split(",");
        return Promise.resolve(
          createMockResponse({
            data: {
              months: (months ?? []).map((month) => ({
                month,
                taxableAmount: 0,
                nonTaxableAmount: 0,
                totalAmount: 0,
              })),
            },
          }),
        );
      }

      if (url.startsWith("/api/payroll/preview-annual?")) {
        return Promise.resolve(createMockResponse(annualPayload));
      }

      throw new Error(`Unexpected request: ${url}`);
    });
  }

  it("uses a response that covers each requested year exactly once", async () => {
    mockPreviewFetch(createAnnualPayload(requestedYears));
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useShiftPayrollPreview(createPreviewInput()),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.annualErrorMessage).toBeNull();
      expect(result.current.years).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            year: 2026,
            baselineTaxableAmount: 202600,
          }),
          expect.objectContaining({
            year: 2027,
            baselineTaxableAmount: 202700,
          }),
        ]),
      );
    });
  });

  it.each([
    ["is missing a requested year", createAnnualPayload([2026])],
    ["contains an extra year", createAnnualPayload([2026, 2027, 2028])],
    ["contains a duplicate year", createAnnualPayload([2026, 2026])],
  ])(
    "rejects an annual response that %s",
    async (_description, annualPayload) => {
      mockPreviewFetch(annualPayload);
      const queryClient = createQueryClient();
      const { result } = renderHook(
        () => useShiftPayrollPreview(createPreviewInput()),
        {
          wrapper: createWrapper(queryClient),
        },
      );

      await waitFor(() => {
        expect(result.current.annualErrorMessage).not.toBeNull();
      });
      expect(result.current.isAnnualResponseIncomplete).toBe(false);
    },
  );

  it("reports annual loading while the requested-year response is pending", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/payroll/preview-baseline?")) {
        const months = new URL(url, "http://localhost").searchParams
          .get("months")
          ?.split(",");
        return Promise.resolve(
          createMockResponse({
            data: {
              months: (months ?? []).map((month) => ({
                month,
                taxableAmount: 0,
                nonTaxableAmount: 0,
                totalAmount: 0,
              })),
            },
          }),
        );
      }

      if (url.startsWith("/api/payroll/preview-annual?")) {
        return new Promise<Response>(() => undefined);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useShiftPayrollPreview(createPreviewInput()),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(result.current.isAnnualLoading).toBe(true);
    });
  });
});
