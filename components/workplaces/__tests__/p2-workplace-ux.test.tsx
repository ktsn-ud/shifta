import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { TimetableForm } from "@/components/workplaces/timetable-form";
import { TimetableList } from "@/components/workplaces/timetable-list";
import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";
import { WorkplaceForm } from "@/components/workplaces/workplace-form";
import { WorkplaceList } from "@/components/workplaces/workplace-list";
import { PayrollRuleList } from "@/components/workplaces/payroll-rule-list";
import {
  useWorkplaceDetailQuery,
  useWorkplaceEditDetailQuery,
  useWorkplacePayrollRuleDetailQuery,
  useWorkplacePayrollRulesQuery,
  useWorkplacesQuery,
  useWorkplaceTimetablesQuery,
} from "@/lib/query/queries/workplaces";
import {
  createWorkplaceAction,
  createPayrollRuleAction,
  createTimetableAction,
  deleteWorkplaceAction,
} from "@/lib/actions/workplace";
import type { SyncResponsePayload } from "@/lib/google-calendar/sync-response";
import { messages } from "@/lib/messages";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { buildActionableErrorMessage } from "@/lib/user-facing-error";
import { useUndoableAction } from "@/hooks/use-undoable-action";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/hooks/use-reset-on-route-hidden", () => ({
  useResetOnRouteHidden: () => ({ markForResetOnRouteHidden: jest.fn() }),
}));

jest.mock("@/lib/query/queries/workplaces", () => ({
  useWorkplaceDetailQuery: jest.fn(),
  useWorkplaceEditDetailQuery: jest.fn(),
  useWorkplacePayrollRuleDetailQuery: jest.fn(),
  useWorkplacePayrollRulesQuery: jest.fn(),
  useWorkplacesQuery: jest.fn(),
  useWorkplaceTimetablesQuery: jest.fn(),
}));

jest.mock("@/lib/query/query-client", () => ({
  getBrowserQueryClient: jest.fn(() => ({
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  })),
}));

jest.mock("@/lib/actions/workplace", () => ({
  createWorkplaceAction: jest.fn(),
  deleteWorkplaceAction: jest.fn(),
  createPayrollRuleAction: jest.fn(),
  updatePayrollRuleAction: jest.fn(),
  createTimetableAction: jest.fn(),
  updateTimetableAction: jest.fn(),
  deleteTimetableAction: jest.fn(),
  updateWorkplaceAction: jest.fn(),
}));

jest.mock("@/hooks/use-undoable-action", () => ({
  useUndoableAction: jest.fn(),
}));

const mockedUseWorkplaceDetailQuery =
  useWorkplaceDetailQuery as jest.MockedFunction<
    typeof useWorkplaceDetailQuery
  >;
const mockedUseWorkplaceEditDetailQuery =
  useWorkplaceEditDetailQuery as jest.MockedFunction<
    typeof useWorkplaceEditDetailQuery
  >;
const mockedUseWorkplacePayrollRuleDetailQuery =
  useWorkplacePayrollRuleDetailQuery as jest.MockedFunction<
    typeof useWorkplacePayrollRuleDetailQuery
  >;
const mockedUseWorkplacePayrollRulesQuery =
  useWorkplacePayrollRulesQuery as jest.MockedFunction<
    typeof useWorkplacePayrollRulesQuery
  >;
const mockedUseWorkplacesQuery = useWorkplacesQuery as jest.MockedFunction<
  typeof useWorkplacesQuery
>;
const mockedUseWorkplaceTimetablesQuery =
  useWorkplaceTimetablesQuery as jest.MockedFunction<
    typeof useWorkplaceTimetablesQuery
  >;
const createWorkplaceActionMock = jest.mocked(createWorkplaceAction);
const createPayrollRuleActionMock = jest.mocked(createPayrollRuleAction);
const createTimetableActionMock = jest.mocked(createTimetableAction);
const deleteWorkplaceActionMock = jest.mocked(deleteWorkplaceAction);
const getBrowserQueryClientMock = jest.mocked(getBrowserQueryClient);
const useUndoableActionMock = jest.mocked(useUndoableAction);
type ScheduledUndoableAction = Parameters<
  ReturnType<typeof useUndoableAction>["schedule"]
>[0];
const scheduleUndoableActionMock = jest.fn<
  boolean,
  [ScheduledUndoableAction]
>();

const successfulSync = {
  status: "success",
  ok: true,
  pending: false,
  errorMessage: null,
  errorCode: null,
  requiresCalendarSetup: false,
  requiresSignOut: false,
} as const satisfies SyncResponsePayload;

describe("勤務先管理のP2 UX", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockedUseWorkplacesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplacesQuery>);
    mockedUseWorkplaceDetailQuery.mockReturnValue({
      data: {
        id: "workplace-1",
        name: "青葉塾",
        type: "CRAM_SCHOOL",
        color: "#3366FF",
      },
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplaceDetailQuery>);
    mockedUseWorkplaceEditDetailQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplaceEditDetailQuery>);
    mockedUseWorkplacePayrollRuleDetailQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplacePayrollRuleDetailQuery>);
    mockedUseWorkplacePayrollRulesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplacePayrollRulesQuery>);
    mockedUseWorkplaceTimetablesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplaceTimetablesQuery>);
    createWorkplaceActionMock.mockReset();
    createPayrollRuleActionMock.mockReset();
    createTimetableActionMock.mockReset();
    deleteWorkplaceActionMock.mockReset();
    getBrowserQueryClientMock.mockReset();
    getBrowserQueryClientMock.mockReturnValue({
      getQueryData: jest.fn(),
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    } as unknown as ReturnType<typeof getBrowserQueryClient>);
    scheduleUndoableActionMock.mockReset();
    useUndoableActionMock.mockReturnValue({
      schedule: scheduleUndoableActionMock,
    });
  });

  it("勤務先設定一覧の再取得中は共通更新フロートを表示する", () => {
    mockedUseWorkplacesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: true,
      error: null,
    } as unknown as ReturnType<typeof useWorkplacesQuery>);
    const { rerender } = render(
      <WorkplaceList currentUserId="user-1" initialWorkplaces={[]} />,
    );
    expect(screen.getByLabelText("更新中")).toBeInTheDocument();

    mockedUseWorkplacePayrollRulesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: true,
      error: null,
    } as unknown as ReturnType<typeof useWorkplacePayrollRulesQuery>);
    rerender(
      <PayrollRuleList
        workplaceId="workplace-1"
        initialWorkplace={{
          id: "workplace-1",
          name: "青葉塾",
          type: "CRAM_SCHOOL",
          color: "#3366FF",
        }}
        initialRules={[]}
      />,
    );
    expect(screen.getByLabelText("更新中")).toBeInTheDocument();

    mockedUseWorkplaceTimetablesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: true,
      error: null,
    } as unknown as ReturnType<typeof useWorkplaceTimetablesQuery>);
    rerender(
      <TimetableList
        workplaceId="workplace-1"
        initialWorkplace={{
          id: "workplace-1",
          name: "青葉塾",
          type: "CRAM_SCHOOL",
          color: "#3366FF",
        }}
        initialTimetables={[]}
      />,
    );
    expect(screen.getByLabelText("更新中")).toBeInTheDocument();
  });

  it("勤務先一覧と給与ルール一覧の空状態から作成画面へ進める", () => {
    const { rerender } = render(
      <WorkplaceList currentUserId="user-1" initialWorkplaces={[]} />,
    );

    expect(
      screen.getByRole("link", { name: "最初の勤務先を追加" }),
    ).toHaveAttribute("href", "/my/workplaces/new");

    rerender(
      <PayrollRuleList
        workplaceId="workplace-1"
        initialWorkplace={{
          id: "workplace-1",
          name: "青葉塾",
          type: "CRAM_SCHOOL",
          color: "#3366FF",
        }}
        initialRules={[]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "給与ルールを追加" }),
    ).toHaveAttribute("href", "/my/workplaces/workplace-1/payroll-rules/new");
  });

  it("GENERAL勤務先には時間割を設定できない理由を表示する", () => {
    mockedUseWorkplaceDetailQuery.mockReturnValue({
      data: {
        id: "workplace-1",
        name: "カフェ",
        type: "GENERAL",
        color: "#3366FF",
      },
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplaceDetailQuery>);

    render(
      <TimetableList
        workplaceId="workplace-1"
        initialWorkplace={{
          id: "workplace-1",
          name: "カフェ",
          type: "GENERAL",
          color: "#3366FF",
        }}
        initialTimetables={[]}
      />,
    );

    expect(
      screen.getByText("一般勤務先では時間割を設定できません"),
    ).toBeInTheDocument();
  });

  it("勤務先作成時は初期給与ルールが初期状態でOFFで、作成後は給与ルール作成へ進む", async () => {
    createWorkplaceActionMock.mockResolvedValue({
      data: { id: "workplace-1", type: "CRAM_SCHOOL" },
      initialPayrollRule: null,
      sync: successfulSync,
    });

    render(<WorkplaceForm mode="create" initialRuleStartDate="2026-07-01" />);

    expect(
      screen.getByRole("checkbox", { name: "初期給与ルールを同時に作成する" }),
    ).not.toBeChecked();
    expect(screen.queryByLabelText("適用開始日")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("勤務先名"), {
      target: { value: "青葉塾" },
    });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/my/workplaces/workplace-1/payroll-rules/new",
      );
    });
    expect(createWorkplaceActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "青葉塾" }),
    );
  });

  it("給与ルールと時間割の作成成功時は、完全な同期結果を受けて各一覧へ遷移する", async () => {
    createPayrollRuleActionMock.mockResolvedValue({
      data: { id: "rule-1", workplaceId: "workplace-1" },
      warning: null,
      sync: successfulSync,
    });

    const payrollRule = render(
      <PayrollRuleForm mode="create" workplaceId="workplace-1" />,
    );
    fireEvent.change(screen.getByLabelText("適用開始日"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(createPayrollRuleActionMock).toHaveBeenCalledWith(
        "workplace-1",
        expect.objectContaining({ startDate: "2026-07-01" }),
      );
      expect(pushMock).toHaveBeenCalledWith(
        "/my/workplaces/workplace-1/payroll-rules",
      );
    });
    payrollRule.unmount();

    pushMock.mockReset();
    createTimetableActionMock.mockResolvedValue({
      data: { id: "timetable-1", workplaceId: "workplace-1" },
      sync: successfulSync,
    });
    const timetable = render(
      <TimetableForm mode="create" workplaceId="workplace-1" />,
    );
    fireEvent.change(screen.getByLabelText("時間割セット名"), {
      target: { value: "夏期時間割" },
    });
    const timeInputs =
      timetable.container.querySelectorAll<HTMLInputElement>(
        'input[type="time"]',
      );
    fireEvent.change(timeInputs[0]!, { target: { value: "09:00" } });
    fireEvent.change(timeInputs[1]!, { target: { value: "10:00" } });
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存して完了" }));

    await waitFor(() => {
      expect(createTimetableActionMock).toHaveBeenCalledWith("workplace-1", {
        name: "夏期時間割",
        items: [{ period: 1, startTime: "09:00", endTime: "10:00" }],
      });
      expect(pushMock).toHaveBeenCalledWith(
        "/my/workplaces/workplace-1/timetables",
      );
    });
  });

  it("各フォームは error union を受けた場合に遷移せず、既存のエラー表示を維持する", async () => {
    createWorkplaceActionMock.mockResolvedValue({
      error: "勤務先を保存できません",
    });
    const workplace = render(
      <WorkplaceForm mode="create" initialRuleStartDate="2026-07-01" />,
    );
    fireEvent.change(screen.getByLabelText("勤務先名"), {
      target: { value: "青葉塾" },
    });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(createWorkplaceActionMock).toHaveBeenCalledTimes(1);
      expect(within(workplace.container).getByRole("alert")).toHaveTextContent(
        buildActionableErrorMessage(
          messages.error.workplaceSaveFailed,
          "server",
        ),
      );
    });
    expect(pushMock).not.toHaveBeenCalled();
    workplace.unmount();

    createPayrollRuleActionMock.mockResolvedValue({
      error: "給与ルールを保存できません",
      details: {
        fieldErrors: { baseHourlyWage: ["基本時給を確認してください"] },
      },
    });
    const payrollRule = render(
      <PayrollRuleForm mode="create" workplaceId="workplace-1" />,
    );
    fireEvent.change(screen.getByLabelText("適用開始日"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(createPayrollRuleActionMock).toHaveBeenCalledTimes(1);
      expect(
        within(payrollRule.container).getByText("給与ルールを保存できません"),
      ).toBeInTheDocument();
      expect(
        within(payrollRule.container).getByText("基本時給を確認してください"),
      ).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
    payrollRule.unmount();

    createTimetableActionMock.mockResolvedValue({
      error: "時間割を保存できません",
    });
    const timetable = render(
      <TimetableForm mode="create" workplaceId="workplace-1" />,
    );
    fireEvent.change(screen.getByLabelText("時間割セット名"), {
      target: { value: "夏期時間割" },
    });
    const timeInputs =
      timetable.container.querySelectorAll<HTMLInputElement>(
        'input[type="time"]',
      );
    fireEvent.change(timeInputs[0]!, { target: { value: "09:00" } });
    fireEvent.change(timeInputs[1]!, { target: { value: "10:00" } });
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存して完了" }));

    await waitFor(() => {
      expect(createTimetableActionMock).toHaveBeenCalledTimes(1);
      expect(
        within(timetable.container).getByText(
          buildActionableErrorMessage(
            messages.error.timetableSaveFailed,
            "server",
          ),
        ),
      ).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("削除 Action が失敗したときは楽観的な勤務先一覧を復元する", async () => {
    const workplace = {
      id: "workplace-1",
      name: "青葉塾",
      type: "CRAM_SCHOOL" as const,
      color: "#3366FF",
      _count: { shifts: 0, payrollRules: 0, timetableSets: 0 },
    };
    const queryClient = {
      getQueryData: jest.fn(() => [workplace]),
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    };
    getBrowserQueryClientMock.mockReturnValue(
      queryClient as unknown as ReturnType<typeof getBrowserQueryClient>,
    );
    mockedUseWorkplacesQuery.mockReturnValue({
      data: [workplace],
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplacesQuery>);
    deleteWorkplaceActionMock.mockResolvedValue({
      error: "削除に失敗しました",
    });

    render(
      <WorkplaceList currentUserId="user-1" initialWorkplaces={[workplace]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    const scheduled = scheduleUndoableActionMock.mock.calls[0]?.[0];
    expect(scheduled).toEqual(
      expect.objectContaining({ id: "workplace-workplace-1" }),
    );
    await scheduled?.onCommit();

    expect(deleteWorkplaceActionMock).toHaveBeenCalledWith("workplace-1");
    expect(queryClient.setQueryData).toHaveBeenLastCalledWith(
      expect.anything(),
      [workplace],
    );
  });

  it("給与ルールの終了日が当日まで適用されることをフォームと一覧で明示する", () => {
    const { rerender } = render(
      <PayrollRuleForm mode="create" workplaceId="workplace-1" />,
    );

    expect(
      screen.getByLabelText("適用終了日（この日まで）"),
    ).toBeInTheDocument();

    const rule = {
      id: "rule-1",
      workplaceId: "workplace-1",
      startDate: "2026-07-01",
      endDate: "2026-08-01",
      baseHourlyWage: 1200,
      holidayAllowanceHourly: 0,
      nightPremiumRate: 0.25,
      overtimePremiumRate: 0.25,
      dailyOvertimeThreshold: 8,
      holidayType: "NONE" as const,
    };
    mockedUseWorkplacePayrollRulesQuery.mockReturnValue({
      data: [rule],
      isLoading: false,
      isPending: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
    } as ReturnType<typeof useWorkplacePayrollRulesQuery>);

    rerender(
      <PayrollRuleList
        workplaceId="workplace-1"
        initialWorkplace={{
          id: "workplace-1",
          name: "青葉塾",
          type: "CRAM_SCHOOL",
          color: "#3366FF",
        }}
        initialRules={[rule]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "適用期間（終了日を含む）" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "2026-07-01 〜 2026-07-31" }),
    ).toBeInTheDocument();
  });

  it("時間割作成で追加継続と保存完了の役割を明示する", () => {
    render(<TimetableForm mode="create" workplaceId="workplace-1" />);

    expect(
      screen.getByRole("button", { name: "追加して続ける" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "保存して完了" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "まだ保存待ちのセットはありません。「追加して続ける」で入力中のセットを追加できます。",
      ),
    ).toBeInTheDocument();
  });

  it("時間割フォームでは30コマと20セットで追加操作を停止し、上限を表示する", () => {
    const timetable = render(
      <TimetableForm mode="create" workplaceId="workplace-1" />,
    );
    const addItemButton = screen.getByRole("button", {
      name: "行を追加",
    });
    for (let index = 0; index < 29; index += 1) {
      fireEvent.click(addItemButton);
    }

    expect(screen.getByText("30/30件")).toBeInTheDocument();
    expect(addItemButton).toBeDisabled();
    timetable.unmount();

    const queued = render(
      <TimetableForm mode="create" workplaceId="workplace-1" />,
    );
    const queueButton = screen.getByRole("button", {
      name: "追加して続ける",
    });
    for (let index = 0; index < 20; index += 1) {
      fireEvent.change(screen.getByLabelText("時間割セット名"), {
        target: { value: `時間割${index + 1}` },
      });
      const timeInputs =
        queued.container.querySelectorAll<HTMLInputElement>(
          'input[type="time"]',
        );
      fireEvent.change(timeInputs[0]!, { target: { value: "09:00" } });
      fireEvent.change(timeInputs[1]!, { target: { value: "10:00" } });
      fireEvent.change(screen.getByRole("spinbutton"), {
        target: { value: "1" },
      });
      fireEvent.click(queueButton);
    }

    expect(screen.getByText("保存待ちの時間割セット (20)")).toBeInTheDocument();
    expect(queueButton).toBeDisabled();
    expect(screen.getByText("最大20件")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "作成予定1を削除" }));

    expect(screen.getByText("保存待ちの時間割セット (19)")).toBeInTheDocument();
    expect(queueButton).toBeEnabled();
  });

  it("時間割フォームは31限を送信せず、コマ番号入力の上限を表示する", () => {
    const timetable = render(
      <TimetableForm mode="create" workplaceId="workplace-1" />,
    );
    const periodInput = screen.getByRole("spinbutton");
    expect(periodInput).toHaveAttribute("max", "30");

    fireEvent.change(screen.getByLabelText("時間割セット名"), {
      target: { value: "夏期時間割" },
    });
    const timeInputs =
      timetable.container.querySelectorAll<HTMLInputElement>(
        'input[type="time"]',
      );
    fireEvent.change(timeInputs[0]!, { target: { value: "09:00" } });
    fireEvent.change(timeInputs[1]!, { target: { value: "10:00" } });
    fireEvent.change(periodInput, { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "保存して完了" }));

    expect(
      screen.getByText("コマ番号は30以下の整数で入力してください。"),
    ).toBeInTheDocument();
    expect(createTimetableActionMock).not.toHaveBeenCalled();
  });

  it("既存の31限の時間割を編集フォームに表示できる", () => {
    mockedUseWorkplaceDetailQuery.mockReturnValue({
      data: { id: "workplace-1", name: "青葉塾", type: "CRAM_SCHOOL" },
      isPending: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplaceDetailQuery>);
    mockedUseWorkplaceTimetablesQuery.mockReturnValue({
      data: [
        {
          id: "set-legacy",
          workplaceId: "workplace-1",
          name: "旧時間割",
          sortOrder: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
          items: [
            {
              id: "period-31",
              timetableSetId: "set-legacy",
              period: 31,
              startTime: "1970-01-01T19:00:00.000Z",
              endTime: "1970-01-01T20:00:00.000Z",
            },
          ],
        },
      ],
      isPending: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplaceTimetablesQuery>);

    render(
      <TimetableForm
        mode="edit"
        workplaceId="workplace-1"
        timetableId="set-legacy"
      />,
    );

    expect(screen.getByLabelText("時間割セット名")).toHaveValue("旧時間割");
    expect(screen.getByRole("spinbutton")).toHaveValue(31);
    expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "追加して続ける" }),
    ).not.toBeInTheDocument();
  });
});
