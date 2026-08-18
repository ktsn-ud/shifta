import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { BulkShiftEditPageClient } from "@/components/shifts/bulk-shift-edit-page-client";
import { useMonthShifts } from "@/hooks/use-month-shifts";
import { invalidateAfterShiftMutation } from "@/lib/query/invalidation";
import { upsertMonthShiftsInCachesOptimistically } from "@/lib/query/optimistic-shifts";
import { getBrowserQueryClient } from "@/lib/query/query-client";

const replaceMock = jest.fn();
const useMonthShiftsMock = jest.mocked(useMonthShifts);
const invalidateAfterShiftMutationMock = jest.mocked(
  invalidateAfterShiftMutation,
);
const upsertMonthShiftsInCachesOptimisticallyMock = jest.mocked(
  upsertMonthShiftsInCachesOptimistically,
);
const getBrowserQueryClientMock = jest.mocked(getBrowserQueryClient);

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
    }) =>
      value === "date" || value === "workplace" ? (
        <select
          aria-label="並び替え"
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
        >
          <option value="date">日付順</option>
          <option value="workplace">勤務先順</option>
        </select>
      ) : (
        <SelectContext.Provider value={{ disabled, onValueChange }}>
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
          disabled={context?.disabled}
          onClick={() => context?.onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    SelectTrigger: () => null,
    SelectValue: () => null,
  };
});

type ShiftInput = {
  id: string;
  date: string;
  workplaceName: string;
  shiftType?: "NORMAL" | "LESSON";
  isConfirmed?: boolean;
};

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
      color: "#3366FF",
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
    />,
  );
}

describe("BulkShiftEditPageClient", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getBrowserQueryClientMock.mockReturnValue("query-client" as never);
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

  it("keeps an ID-keyed draft and row error after changing sort order", async () => {
    const user = userEvent.setup();
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "保存できません" }),
    });
    renderPage();

    await user.type(
      screen.getByLabelText("shift-a コメント"),
      "確定済みでも編集",
    );
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(await screen.findByText("保存できません")).toBeInTheDocument();
    expect(screen.getByText("変更 1 件")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "並び替え" }), {
      target: { value: "workplace" },
    });

    expect(screen.getByLabelText("shift-a コメント")).toHaveValue(
      "確定済みでも編集",
    );
    expect(screen.getByText("保存できません")).toBeInTheDocument();
    expect(screen.getByText("変更 1 件")).toBeInTheDocument();
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
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { ...shifts[0], comment: "更新済み", transportationAllowance: 480 },
        ],
      }),
    });
    renderPage(shifts);

    await user.clear(screen.getByLabelText("shift-a 交通費"));
    await user.type(screen.getByLabelText("shift-a 交通費"), "480");
    await user.type(screen.getByLabelText("shift-a コメント"), "更新済み");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

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
        [
          {
            ...shifts[0],
            comment: "更新済み",
            transportationAllowance: 480,
          },
        ],
      );
      expect(invalidateAfterShiftMutationMock).toHaveBeenCalledWith(
        "query-client",
        { mode: "background", refetchType: "none" },
      );
    });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("1件を保存しました"),
    );
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

    await user.type(
      screen.getByLabelText("shift-a コメント"),
      "送信中の下書き",
    );
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存中..." })).toBeDisabled();
    });
    expect(screen.getByLabelText("shift-a コメント")).toBeDisabled();
    expect(screen.getByLabelText("shift-a コメント")).toHaveValue(
      "送信中の下書き",
    );
    expect(screen.getByRole("button", { name: "前月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "翌月" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "並び替え" })).toBeDisabled();

    resolveResponse({
      ok: false,
      json: async () => ({ error: "保存できません" }),
    } as Response);
    expect(await screen.findByText("保存できません")).toBeInTheDocument();
    expect(screen.getByLabelText("shift-a コメント")).toHaveValue(
      "送信中の下書き",
    );
    expect(screen.getByLabelText("shift-a コメント")).toBeEnabled();
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
    expect(screen.getByLabelText("lesson-1 コメント")).toBeEnabled();
    expect(
      screen.getByText("導出: 時間割を選択してください"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("lesson-1 開始")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("lesson-1 休憩")).not.toBeInTheDocument();
    expect(screen.getByText("確定済み")).toBeInTheDocument();
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
      />,
    );

    expect(screen.getByText("疎な時間割")).toBeInTheDocument();
    expect(screen.queryByText("他勤務先の時間割")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "2限" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("導出: 時間割を選択してください"),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "3限" })[0]!);

    expect(
      screen.getByText("導出: 11:00〜11:50 / 休憩0分"),
    ).toBeInTheDocument();
    expect(screen.getByText("変更 1 件")).toBeInTheDocument();
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
      />,
    );

    await user.type(screen.getByLabelText("lesson-error コメント"), "修正");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(
      await screen.findByText("授業シフトを保存できません"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "別セット" }));
    expect(
      screen.queryByText("授業シフトを保存できません"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(
      await screen.findByText("授業シフトを保存できません"),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "3限" })[0]!);
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
