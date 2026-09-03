import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { BulkShiftEditPageClient } from "@/components/shifts/bulk-shift-edit-page-client";
import { useBulkShiftEditPayrollPreview } from "@/components/shifts/use-bulk-shift-edit-payroll-preview";
import { useMonthShifts } from "@/hooks/use-month-shifts";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { upsertMonthShiftsInCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { getBrowserQueryClient } from "@/lib/query/query-client";

jest.mock("@/components/shifts/use-bulk-shift-edit-payroll-preview", () => ({
  useBulkShiftEditPayrollPreview: jest.fn(),
}));

const replaceMock = jest.fn();
const useMonthShiftsMock = jest.mocked(useMonthShifts);
const invalidateAfterShiftMutationMock = jest.mocked(
  invalidateAfterShiftMutation,
);
const upsertMonthShiftsInCachesOptimisticallyMock = jest.mocked(
  upsertMonthShiftsInCachesOptimistically,
);
const getBrowserQueryClientMock = jest.mocked(getBrowserQueryClient);
const useBulkShiftEditPayrollPreviewMock = jest.mocked(
  useBulkShiftEditPayrollPreview,
);

function emptyPayrollPreview() {
  return {
    months: [],
    years: [],
    unresolvedCount: 0,
    isBaselineLoading: false,
    baselineErrorMessage: null,
    isAnnualLoading: false,
    annualErrorMessage: null,
    isAnnualResponseIncomplete: false,
  };
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/hooks/use-month-shifts", () => ({
  useMonthShifts: jest.fn(),
  normalizeMonthShift: (value: unknown) => value,
}));
jest.mock("@/lib/query/query-client", () => ({
  getBrowserQueryClient: jest.fn(() => "query-client"),
}));
jest.mock("@/lib/query/invalidation", () => ({
  invalidateAfterShiftMutation: jest.fn(),
}));
jest.mock("@/lib/query/optimistic-shifts", () => ({
  upsertMonthShiftsInCachesOptimistically: jest.fn(),
}));

jest.mock("@/components/ui/select", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const SelectContext = React.createContext<{
    disabled: boolean;
    onValueChange: (value: string) => void;
    value: string;
  } | null>(null);

  return {
    Select: ({
      value,
      onValueChange,
      children,
      disabled = false,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
      disabled?: boolean;
    }) => (
      <SelectContext.Provider value={{ disabled, onValueChange, value }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectGroup: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const context = React.useContext(SelectContext);
      return (
        <button
          type="button"
          data-slot="select-item"
          disabled={context?.disabled}
          onClick={() => context?.onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    SelectTrigger: ({
      children,
      className,
      size,
      disabled,
      ...buttonProps
    }: {
      children: React.ReactNode;
      className?: string;
      size?: "sm" | "default";
      disabled?: boolean;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const context = React.useContext(SelectContext);
      if (context?.value !== "date" && context?.value !== "workplace") {
        return (
          <button
            type="button"
            className={className}
            data-slot="select-trigger"
            data-size={size}
            {...buttonProps}
            disabled={context?.disabled || disabled}
          >
            {children}
          </button>
        );
      }

      const otherOrder = context.value === "date" ? "workplace" : "date";
      return (
        <select
          aria-label="並び替え"
          className={className}
          value={context.value}
          disabled={context.disabled}
          onChange={(event) => context.onValueChange(event.target.value)}
        >
          <option value={context.value}>{children}</option>
          <option value={otherOrder} />
        </select>
      );
    },
    SelectValue: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

type ShiftInput = {
  id: string;
  date: string;
  workplaceName: string;
  workplaceColor?: string;
  shiftType?: "NORMAL" | "LESSON";
  isConfirmed?: boolean;
};

function createPreviewProps(workplaceIds: string[]) {
  return {
    previewWorkplaces: workplaceIds.map((id) => ({
      id,
      closingDayType: "END_OF_MONTH" as const,
      closingDay: null,
      payday: 25,
    })),
    previewPayrollRules: workplaceIds.map((workplaceId) => ({
      workplaceId,
      startDate: "2020-01-01",
      endDate: null,
      baseHourlyWage: 1000,
      nightPremiumRate: 0,
      dailyOvertimeThreshold: 8,
      holidayType: "NONE" as const,
    })),
  };
}

function createShift(input: ShiftInput) {
  const isLesson = input.shiftType === "LESSON";
  return {
    id: input.id,
    workplaceId: `workplace-${input.id}`,
    date: input.date,
    startTime: "1970-01-01T09:00:00.000Z",
    endTime: "1970-01-01T18:00:00.000Z",
    breakMinutes: 60,
    transportationAllowance: 0,
    isConfirmed: input.isConfirmed ?? false,
    shiftType: input.shiftType ?? "NORMAL",
    comment: null,
    googleSyncStatus: "SUCCESS" as const,
    googleSyncError: null,
    googleSyncedAt: null,
    workedMinutes: 480,
    estimatedPay: 8000,
    workplace: {
      id: `workplace-${input.id}`,
      name: input.workplaceName,
      color: input.workplaceColor ?? "#3366FF",
      type: isLesson ? ("CRAM_SCHOOL" as const) : ("GENERAL" as const),
    },
    lessonRange: isLesson
      ? {
          id: `range-${input.id}`,
          shiftId: input.id,
          timetableSetId: `set-${input.id}`,
          startPeriod: 1,
          endPeriod: 2,
        }
      : null,
  };
}

function renderPage(
  shifts = [
    createShift({
      id: "shift-a",
      date: "2026-03-20T00:00:00.000Z",
      workplaceName: "勤務先Z",
      isConfirmed: true,
    }),
    createShift({
      id: "shift-b",
      date: "2026-03-18T00:00:00.000Z",
      workplaceName: "勤務先A",
    }),
  ],
) {
  useMonthShiftsMock.mockReturnValue({
    shifts,
    isRefreshing: false,
    errorMessage: null,
  } as ReturnType<typeof useMonthShifts>);
  return render(
    <BulkShiftEditPageClient
      currentUserId="user-1"
      initialMonth="2026-03"
      initialShifts={shifts}
      initialStartDate="2026-03-01"
      initialEndDate="2026-03-31"
      timetableSets={[]}
      {...createPreviewProps(shifts.map((shift) => shift.workplaceId))}
    />,
  );
}

function tableCell(element: HTMLElement): HTMLTableCellElement {
  const cell = element.closest("td");
  if (!(cell instanceof HTMLTableCellElement)) {
    throw new Error("Expected the control to be inside a table cell.");
  }
  return cell;
}

const DIRTY_CONTROL_CLASS_NAMES = [
  "bg-accent/65!",
  "disabled:bg-accent/65!",
] as const;

function expectNotDirtyControlHighlighted(element: HTMLElement) {
  for (const className of DIRTY_CONTROL_CLASS_NAMES) {
    expect(element).not.toHaveClass(className);
  }
}

function expectOnlyControlHighlighted(
  controls: HTMLElement[],
  highlighted: HTMLElement | HTMLElement[] | null,
) {
  const row = controls[0]?.closest("tr");
  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error("Expected the controls to be inside a table row.");
  }

  for (const cell of row.querySelectorAll("td")) {
    expectNotDirtyControlHighlighted(cell);
  }

  const highlightedControls = highlighted
    ? Array.isArray(highlighted)
      ? highlighted
      : [highlighted]
    : [];
  for (const control of controls) {
    if (highlightedControls.includes(control)) {
      expect(control).toHaveClass(...DIRTY_CONTROL_CLASS_NAMES);
    } else {
      expectNotDirtyControlHighlighted(control);
    }
  }
}

function selectTrigger(name: string): HTMLButtonElement {
  const trigger = screen
    .getAllByRole("button", { name })
    .find((element) => element.dataset.slot === "select-trigger");
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error(`Expected a select trigger named ${name}.`);
  }
  return trigger;
}

function selectItem(name: string, index = 0): HTMLButtonElement {
  const item = screen
    .getAllByRole("button", { name })
    .filter((element) => element.dataset.slot === "select-item")[index];
  if (!(item instanceof HTMLButtonElement)) {
    throw new Error(`Expected select item ${index} named ${name}.`);
  }
  return item;
}

describe("BulkShiftEditPageClient", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getBrowserQueryClientMock.mockReturnValue("query-client" as never);
    useBulkShiftEditPayrollPreviewMock.mockImplementation((input) =>
      input.beforeShifts.length === 0
        ? emptyPayrollPreview()
        : {
            ...emptyPayrollPreview(),
            months: [
              {
                month: "2026-03",
                baselineWage: 10000,
                baselineTransportationAllowance: 0,
                baselineTotalAmount: 10000,
                differenceWage: 1000,
                differenceTransportationAllowance: 480,
                differenceTotalAmount: 1480,
                projectedWage: 11000,
                projectedTransportationAllowance: 480,
                projectedTotalAmount: 11480,
                changeCount: 1,
                unresolvedCount: 0,
                messages: [],
              },
            ],
          },
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
    Object.defineProperty(window, "confirm", {
      configurable: true,
      writable: true,
      value: jest.fn(() => false),
    });
  });

  it("displays the workplace name with its configured color dot", () => {
    renderPage([
      createShift({
        id: "workplace-color",
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "色付き勤務先",
        workplaceColor: "#F97316",
      }),
    ]);

    const workplaceName = screen.getByText("色付き勤務先");
    const workplaceCell = tableCell(workplaceName);
    const colorDot = workplaceCell.querySelector("span[aria-hidden='true']");

    expect(workplaceName).toBeInTheDocument();
    expect(colorDot).toHaveStyle({ backgroundColor: "#F97316" });
  });

  it("highlights only the changed NORMAL control and clears it when restored", () => {
    renderPage([
      createShift({
        id: "normal-highlight",
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "勤務先A",
      }),
    ]);

    const startInput = screen.getByLabelText("normal-highlight 開始");
    const endInput = screen.getByLabelText("normal-highlight 終了");
    const breakInput = screen.getByLabelText("normal-highlight 休憩");
    const transportationInput = screen.getByLabelText(
      "normal-highlight 交通費",
    );
    const commentInput = screen.getByLabelText("normal-highlight コメント");
    const controls = [
      startInput,
      endInput,
      breakInput,
      transportationInput,
      commentInput,
    ];

    fireEvent.change(startInput, { target: { value: "10:00" } });
    expectOnlyControlHighlighted(controls, startInput);
    fireEvent.change(startInput, { target: { value: "09:00" } });
    expectOnlyControlHighlighted(controls, null);

    fireEvent.change(endInput, { target: { value: "17:00" } });
    expectOnlyControlHighlighted(controls, endInput);
    fireEvent.change(endInput, { target: { value: "18:00" } });
    expectOnlyControlHighlighted(controls, null);

    fireEvent.change(breakInput, { target: { value: "30" } });
    expectOnlyControlHighlighted(controls, breakInput);
    fireEvent.change(breakInput, { target: { value: "60" } });
    expectOnlyControlHighlighted(controls, null);

    fireEvent.change(transportationInput, { target: { value: "480" } });
    expectOnlyControlHighlighted(controls, transportationInput);
    fireEvent.change(transportationInput, { target: { value: "0" } });
    expectOnlyControlHighlighted(controls, null);

    fireEvent.change(commentInput, { target: { value: "連絡事項" } });
    expectOnlyControlHighlighted(controls, commentInput);
    fireEvent.change(commentInput, { target: { value: "" } });
    expectOnlyControlHighlighted(controls, null);
  });

  it("keeps the payroll impact preview through sorting and a failed save, then clears it when the edit is reverted", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "保存できません" }),
    });
    renderPage();

    const preview = screen.getByLabelText("支給額への影響プレビュー");
    expect(
      within(preview).getAllByText(
        "勤務内容を変更すると支給額への影響を確認できます",
      ),
    ).not.toHaveLength(0);

    const transportation = screen.getByLabelText("shift-a 交通費");
    fireEvent.change(transportation, { target: { value: "480" } });
    expect(within(preview).getByText("2026年3月支給")).toBeInTheDocument();
    expect(within(preview).getByText("+￥1,480")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "並び替え" }), {
      target: { value: "workplace" },
    });
    expect(within(preview).getByText("2026年3月支給")).toBeInTheDocument();

    fireEvent.change(transportation, { target: { value: "0" } });
    expect(
      within(preview).queryByText("2026年3月支給"),
    ).not.toBeInTheDocument();

    fireEvent.change(transportation, { target: { value: "480" } });
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(await screen.findByText("保存できません")).toBeInTheDocument();
    expect(within(preview).getByText("2026年3月支給")).toBeInTheDocument();
  });

  it("keeps an ID-keyed draft and row error after changing sort order", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "保存できません" }),
    });
    renderPage();

    const sortSelect = screen.getByRole("combobox", { name: "並び替え" });
    expect(sortSelect).toHaveTextContent("日付順");
    expect(sortSelect).not.toHaveTextContent(/date|workplace/);

    await user.type(
      screen.getByLabelText("shift-a コメント"),
      "確定済みでも編集",
    );
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(await screen.findByText("保存できません")).toBeInTheDocument();
    expect(screen.getByText("変更 1 件")).toBeInTheDocument();
    expectOnlyControlHighlighted(
      [screen.getByLabelText("shift-a コメント")],
      screen.getByLabelText("shift-a コメント"),
    );

    fireEvent.change(screen.getByRole("combobox", { name: "並び替え" }), {
      target: { value: "workplace" },
    });

    expect(sortSelect).toHaveTextContent("勤務先順");
    expect(sortSelect).not.toHaveTextContent(/date|workplace/);

    expect(screen.getByLabelText("shift-a コメント")).toHaveValue(
      "確定済みでも編集",
    );
    expect(screen.getByText("保存できません")).toBeInTheDocument();
    expect(screen.getByText("変更 1 件")).toBeInTheDocument();
    expectOnlyControlHighlighted(
      [screen.getByLabelText("shift-a コメント")],
      screen.getByLabelText("shift-a コメント"),
    );
  });

  it("does not restore the previous month's draft or errors after the month-keyed client remounts", async () => {
    const user = userEvent.setup();
    const marchShifts = [
      createShift({
        id: "march-shift",
        date: "2026-03-20T00:00:00.000Z",
        workplaceName: "勤務先A",
      }),
    ];
    const aprilShifts = [
      createShift({
        id: "april-shift",
        date: "2026-04-02T00:00:00.000Z",
        workplaceName: "勤務先A",
      }),
    ];
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "保存できません" }),
    });
    const view = renderPage(marchShifts);

    await user.type(
      screen.getByLabelText("march-shift コメント"),
      "旧月の下書き",
    );
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(await screen.findByText("保存できません")).toBeInTheDocument();

    useMonthShiftsMock.mockReturnValue({
      shifts: aprilShifts,
      isRefreshing: false,
      errorMessage: null,
    } as ReturnType<typeof useMonthShifts>);
    view.rerender(
      <BulkShiftEditPageClient
        key="2026-04"
        currentUserId="user-1"
        initialMonth="2026-04"
        initialShifts={aprilShifts}
        initialStartDate="2026-04-01"
        initialEndDate="2026-04-30"
        timetableSets={[]}
        {...createPreviewProps(aprilShifts.map((shift) => shift.workplaceId))}
      />,
    );

    expect(
      screen.queryByLabelText("march-shift コメント"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("保存できません")).not.toBeInTheDocument();
    expect(screen.getByLabelText("april-shift コメント")).toHaveValue("");
    expect(screen.getByText("変更 0 件")).toBeInTheDocument();
  });

  it("sends only changed NORMAL rows and updates month caches from the successful DTO", async () => {
    const user = userEvent.setup();
    const shifts = [
      createShift({
        id: "shift-a",
        date: "2026-03-20T00:00:00.000Z",
        workplaceName: "勤務先A",
      }),
      createShift({
        id: "shift-b",
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "勤務先B",
      }),
    ];
    const updatedShift = {
      ...shifts[0],
      comment: "更新済み",
      transportationAllowance: 480,
    };
    const fetchMock = globalThis.fetch as jest.Mock;
    let resolveResponse!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    const view = renderPage(shifts);

    expect(
      screen.getByRole("columnheader", { name: "休憩" }),
    ).toHaveTextContent("休憩");
    expect(
      screen.getByRole("columnheader", { name: "休憩" }),
    ).not.toHaveTextContent("分");
    expect(
      screen.getByRole("columnheader", { name: "交通費" }),
    ).toHaveTextContent("交通費");
    expect(
      screen.getByRole("columnheader", { name: "交通費" }),
    ).not.toHaveTextContent("円");
    expect(
      screen.getByLabelText("shift-a 休憩").parentElement,
    ).toHaveTextContent("分");
    expect(
      screen.getByLabelText("shift-a 交通費").parentElement,
    ).toHaveTextContent("円");

    await user.clear(screen.getByLabelText("shift-a 交通費"));
    await user.type(screen.getByLabelText("shift-a 交通費"), "480");
    await user.type(screen.getByLabelText("shift-a コメント"), "更新済み");
    expectOnlyControlHighlighted(
      [
        screen.getByLabelText("shift-a 交通費"),
        screen.getByLabelText("shift-a コメント"),
      ],
      [
        screen.getByLabelText("shift-a 交通費"),
        screen.getByLabelText("shift-a コメント"),
      ],
    );
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    resolveResponse({
      ok: true,
      json: async () => ({ data: [updatedShift] }),
    } as Response);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shifts/bulk",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            shifts: [
              {
                id: "shift-a",
                shiftType: "NORMAL",
                startTime: "09:00",
                endTime: "18:00",
                breakMinutes: 60,
                transportationAllowance: 480,
                comment: "更新済み",
              },
            ],
          }),
        }),
      );
      expect(upsertMonthShiftsInCachesOptimisticallyMock).toHaveBeenCalledWith(
        "query-client",
        [updatedShift],
      );
      expect(invalidateAfterShiftMutationMock).toHaveBeenCalledWith(
        "query-client",
        { mode: "background", refetchType: "none" },
      );
    });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("1件を保存しました"),
    );
    useMonthShiftsMock.mockReturnValue({
      shifts: [updatedShift, shifts[1]],
      isRefreshing: false,
      errorMessage: null,
    } as ReturnType<typeof useMonthShifts>);
    view.rerender(
      <BulkShiftEditPageClient
        currentUserId="user-1"
        initialMonth="2026-03"
        initialShifts={shifts}
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-31"
        timetableSets={[]}
        {...createPreviewProps(shifts.map((shift) => shift.workplaceId))}
      />,
    );
    expectOnlyControlHighlighted(
      [
        screen.getByLabelText("shift-a 交通費"),
        screen.getByLabelText("shift-a コメント"),
      ],
      null,
    );
    expect(
      within(screen.getByLabelText("支給額への影響プレビュー")).getAllByText(
        "勤務内容を変更すると支給額への影響を確認できます",
      ),
    ).not.toHaveLength(0);
  });

  it("does not send a PATCH when more than 31 rows have changes", async () => {
    const user = userEvent.setup();
    const shifts = Array.from({ length: 32 }, (_, index) =>
      createShift({
        id: `shift-${index + 1}`,
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "勤務先A",
      }),
    );
    const fetchMock = globalThis.fetch as jest.Mock;
    renderPage(shifts);

    for (const shift of shifts) {
      fireEvent.change(screen.getByLabelText(`${shift.id} コメント`), {
        target: { value: "変更" },
      });
    }

    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("一括編集は31件までです。");
  });

  it("disables edits, month movement, and sorting while a PATCH is pending without losing the draft", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (value: Response) => void;
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    renderPage();

    const dirtyCommentInput = screen.getByLabelText("shift-a コメント");
    const cleanStartInput = screen.getByLabelText("shift-a 開始");
    await user.type(dirtyCommentInput, "送信中の下書き");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存中..." })).toBeDisabled();
    });
    expect(dirtyCommentInput).toBeDisabled();
    expect(dirtyCommentInput).toHaveValue("送信中の下書き");
    expect(dirtyCommentInput).toHaveClass(
      "bg-accent/65!",
      "disabled:bg-accent/65!",
    );
    expect(cleanStartInput).toBeDisabled();
    expectNotDirtyControlHighlighted(cleanStartInput);
    expect(screen.getByRole("button", { name: "前月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "翌月" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "並び替え" })).toBeDisabled();

    resolveResponse({
      ok: false,
      json: async () => ({ error: "保存できません" }),
    } as Response);
    expect(await screen.findByText("保存できません")).toBeInTheDocument();
    expect(dirtyCommentInput).toHaveValue("送信中の下書き");
    expect(dirtyCommentInput).toBeEnabled();
    expect(dirtyCommentInput).toHaveClass(
      "bg-accent/65!",
      "disabled:bg-accent/65!",
    );
  });

  it("keeps lesson-derived time and break values read-only while allowing shared fields", () => {
    renderPage([
      createShift({
        id: "lesson-1",
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "塾",
        shiftType: "LESSON",
        isConfirmed: true,
      }),
    ]);

    expect(screen.getByLabelText("lesson-1 交通費")).toBeEnabled();
    expect(
      screen.getByLabelText("lesson-1 交通費").parentElement,
    ).toHaveTextContent("円");
    expect(screen.getByLabelText("lesson-1 コメント")).toBeEnabled();
    expect(
      screen.getByText("導出: 時間割を選択してください"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("lesson-1 開始")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("lesson-1 休憩")).not.toBeInTheDocument();
    expect(screen.getByText("確定済み")).toBeInTheDocument();
  });

  it("highlights LESSON controls independently without highlighting derived values", () => {
    const lessonShift = {
      ...createShift({
        id: "lesson-highlight",
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "塾",
        shiftType: "LESSON",
      }),
      workplaceId: "workplace-lesson-highlight",
      workplace: {
        id: "workplace-lesson-highlight",
        name: "塾",
        color: "#3366FF",
        type: "CRAM_SCHOOL" as const,
      },
      lessonRange: {
        id: "range-lesson-highlight",
        shiftId: "lesson-highlight",
        timetableSetId: "set-a",
        startPeriod: 1,
        endPeriod: 2,
      },
    };
    useMonthShiftsMock.mockReturnValue({
      shifts: [lessonShift],
      isRefreshing: false,
      errorMessage: null,
    } as ReturnType<typeof useMonthShifts>);
    render(
      <BulkShiftEditPageClient
        currentUserId="user-1"
        initialMonth="2026-03"
        initialShifts={[lessonShift]}
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-31"
        timetableSets={[
          {
            id: "set-a",
            workplaceId: "workplace-lesson-highlight",
            name: "通常時間割",
            periods: [
              {
                period: 1,
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T09:50:00.000Z",
              },
              {
                period: 2,
                startTime: "1970-01-01T10:00:00.000Z",
                endTime: "1970-01-01T10:50:00.000Z",
              },
            ],
          },
          {
            id: "set-b",
            workplaceId: "workplace-lesson-highlight",
            name: "別セット",
            periods: [
              {
                period: 1,
                startTime: "1970-01-01T11:00:00.000Z",
                endTime: "1970-01-01T11:50:00.000Z",
              },
              {
                period: 2,
                startTime: "1970-01-01T12:00:00.000Z",
                endTime: "1970-01-01T12:50:00.000Z",
              },
            ],
          },
        ]}
        {...createPreviewProps(["workplace-lesson-highlight"])}
      />,
    );

    const transportationInput = screen.getByLabelText(
      "lesson-highlight 交通費",
    );
    const commentInput = screen.getByLabelText("lesson-highlight コメント");
    const timetableSetTrigger = selectTrigger("時間割セット");
    const startPeriodTrigger = selectTrigger("開始コマ");
    const endPeriodTrigger = selectTrigger("終了コマ");
    const controls = [
      timetableSetTrigger,
      startPeriodTrigger,
      endPeriodTrigger,
      transportationInput,
      commentInput,
    ];
    const derivedTimeCell = tableCell(screen.getByText(/^導出:/));
    const derivedBreakCell = tableCell(screen.getByText("導出"));

    fireEvent.change(transportationInput, { target: { value: "480" } });
    expectOnlyControlHighlighted(controls, transportationInput);
    fireEvent.change(transportationInput, { target: { value: "0" } });
    expectOnlyControlHighlighted(controls, null);

    fireEvent.change(commentInput, { target: { value: "連絡事項" } });
    expectOnlyControlHighlighted(controls, commentInput);
    fireEvent.change(commentInput, { target: { value: "" } });
    expectOnlyControlHighlighted(controls, null);

    fireEvent.click(selectItem("別セット"));
    expect(timetableSetTrigger).toHaveTextContent("別セット");
    expect(timetableSetTrigger).not.toHaveTextContent("set-b");
    expectOnlyControlHighlighted(controls, [
      timetableSetTrigger,
      endPeriodTrigger,
    ]);
    expectNotDirtyControlHighlighted(derivedTimeCell);
    expectNotDirtyControlHighlighted(derivedBreakCell);
    fireEvent.click(selectItem("通常時間割"));
    expectOnlyControlHighlighted(controls, endPeriodTrigger);

    fireEvent.click(selectItem("2限"));
    expectOnlyControlHighlighted(controls, startPeriodTrigger);
    expectNotDirtyControlHighlighted(derivedTimeCell);
    expectNotDirtyControlHighlighted(derivedBreakCell);
    fireEvent.click(selectItem("1限"));
    expectOnlyControlHighlighted(controls, null);

    fireEvent.click(selectItem("1限", 1));
    expectOnlyControlHighlighted(controls, endPeriodTrigger);
    expectNotDirtyControlHighlighted(derivedTimeCell);
    expectNotDirtyControlHighlighted(derivedBreakCell);
    fireEvent.click(selectItem("2限", 1));
    expectOnlyControlHighlighted(controls, null);
  });

  it("limits lesson selections to the workplace timetable periods and immediately derives values after a gap", async () => {
    const user = userEvent.setup();
    const lessonShift = {
      ...createShift({
        id: "lesson-gap",
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "塾",
        shiftType: "LESSON",
      }),
      workplaceId: "workplace-lesson",
      workplace: {
        id: "workplace-lesson",
        name: "塾",
        color: "#3366FF",
        type: "CRAM_SCHOOL" as const,
      },
      lessonRange: {
        id: "range-lesson-gap",
        shiftId: "lesson-gap",
        timetableSetId: "set-gap",
        startPeriod: 1,
        endPeriod: 3,
      },
    };
    useMonthShiftsMock.mockReturnValue({
      shifts: [lessonShift],
      isRefreshing: false,
      errorMessage: null,
    } as ReturnType<typeof useMonthShifts>);
    render(
      <BulkShiftEditPageClient
        currentUserId="user-1"
        initialMonth="2026-03"
        initialShifts={[lessonShift]}
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-31"
        timetableSets={[
          {
            id: "set-gap",
            workplaceId: "workplace-lesson",
            name: "疎な時間割",
            periods: [
              {
                period: 1,
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T09:50:00.000Z",
              },
              {
                period: 3,
                startTime: "1970-01-01T11:00:00.000Z",
                endTime: "1970-01-01T11:50:00.000Z",
              },
              {
                period: 4,
                startTime: "1970-01-01T12:00:00.000Z",
                endTime: "1970-01-01T12:50:00.000Z",
              },
            ],
          },
          {
            id: "other-workplace-set",
            workplaceId: "workplace-other",
            name: "他勤務先の時間割",
            periods: [],
          },
        ]}
        {...createPreviewProps(["workplace-lesson"])}
      />,
    );

    expect(selectItem("疎な時間割")).toBeInTheDocument();
    expect(screen.queryByText("他勤務先の時間割")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "2限" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("導出: 時間割を選択してください"),
    ).toBeInTheDocument();

    const startPeriodTrigger = selectTrigger("開始コマ");
    const derivedBreakCell = tableCell(screen.getByText("導出"));
    await user.click(selectItem("3限"));

    expect(
      screen.getByText("導出: 11:00〜11:50 / 休憩0分"),
    ).toBeInTheDocument();
    expect(screen.getByText("変更 1 件")).toBeInTheDocument();
    expectOnlyControlHighlighted([startPeriodTrigger], startPeriodTrigger);
    expectNotDirtyControlHighlighted(derivedBreakCell);
  });

  it("clears a lesson row's stale error when its timetable set or start period changes", async () => {
    const user = userEvent.setup();
    const lessonShift = {
      ...createShift({
        id: "lesson-error",
        date: "2026-03-18T00:00:00.000Z",
        workplaceName: "塾",
        shiftType: "LESSON",
      }),
      workplaceId: "workplace-lesson",
      workplace: {
        id: "workplace-lesson",
        name: "塾",
        color: "#3366FF",
        type: "CRAM_SCHOOL" as const,
      },
      lessonRange: {
        id: "range-lesson-error",
        shiftId: "lesson-error",
        timetableSetId: "set-a",
        startPeriod: 1,
        endPeriod: 3,
      },
    };
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "授業シフトを保存できません" }),
    });
    useMonthShiftsMock.mockReturnValue({
      shifts: [lessonShift],
      isRefreshing: false,
      errorMessage: null,
    } as ReturnType<typeof useMonthShifts>);
    render(
      <BulkShiftEditPageClient
        currentUserId="user-1"
        initialMonth="2026-03"
        initialShifts={[lessonShift]}
        initialStartDate="2026-03-01"
        initialEndDate="2026-03-31"
        timetableSets={[
          {
            id: "set-a",
            workplaceId: "workplace-lesson",
            name: "通常時間割",
            periods: [
              {
                period: 1,
                startTime: "1970-01-01T09:00:00.000Z",
                endTime: "1970-01-01T09:50:00.000Z",
              },
              {
                period: 3,
                startTime: "1970-01-01T11:00:00.000Z",
                endTime: "1970-01-01T11:50:00.000Z",
              },
            ],
          },
          {
            id: "set-b",
            workplaceId: "workplace-lesson",
            name: "別セット",
            periods: [
              {
                period: 1,
                startTime: "1970-01-01T10:00:00.000Z",
                endTime: "1970-01-01T10:50:00.000Z",
              },
              {
                period: 3,
                startTime: "1970-01-01T12:00:00.000Z",
                endTime: "1970-01-01T12:50:00.000Z",
              },
            ],
          },
        ]}
        {...createPreviewProps(["workplace-lesson"])}
      />,
    );

    await user.type(screen.getByLabelText("lesson-error コメント"), "修正");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(
      await screen.findByText("授業シフトを保存できません"),
    ).toBeInTheDocument();

    await user.click(selectItem("別セット"));
    expect(
      screen.queryByText("授業シフトを保存できません"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(
      await screen.findByText("授業シフトを保存できません"),
    ).toBeInTheDocument();

    await user.click(selectItem("3限"));
    expect(
      screen.queryByText("授業シフトを保存できません"),
    ).not.toBeInTheDocument();
  });

  it("warns before changing months or unloading when there are unsaved changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("shift-a コメント"), "未保存");

    await user.click(screen.getByRole("button", { name: "翌月" }));
    expect(window.confirm).toHaveBeenCalledWith(
      "未保存の変更があります。移動しますか？",
    );
    expect(replaceMock).not.toHaveBeenCalled();

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });
});
