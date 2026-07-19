import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimetableForm } from "@/components/workplaces/timetable-form";
import { TimetableList } from "@/components/workplaces/timetable-list";
import { PayrollRuleForm } from "@/components/workplaces/payroll-rule-form";
import { WorkplaceForm } from "@/components/workplaces/workplace-form";
import { WorkplaceList } from "@/components/workplaces/workplace-list";
import { PayrollRuleList } from "@/components/workplaces/payroll-rule-list";
import {
  useWorkplaceDetailQuery,
  useWorkplaceEditDetailQuery,
  useWorkplacePayrollRulesQuery,
  useWorkplacesQuery,
  useWorkplaceTimetablesQuery,
} from "@/lib/query/queries/workplaces";
import { useQuery } from "@tanstack/react-query";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn(),
}));

jest.mock("@/hooks/use-reset-on-route-hidden", () => ({
  useResetOnRouteHidden: () => ({ markForResetOnRouteHidden: jest.fn() }),
}));

jest.mock("@/lib/query/queries/workplaces", () => ({
  useWorkplaceDetailQuery: jest.fn(),
  useWorkplaceEditDetailQuery: jest.fn(),
  useWorkplacePayrollRulesQuery: jest.fn(),
  useWorkplacesQuery: jest.fn(),
  useWorkplaceTimetablesQuery: jest.fn(),
}));

jest.mock("@/lib/query/query-client", () => ({
  getBrowserQueryClient: jest.fn(() => ({
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  })),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseWorkplaceDetailQuery =
  useWorkplaceDetailQuery as jest.MockedFunction<
    typeof useWorkplaceDetailQuery
  >;
const mockedUseWorkplaceEditDetailQuery =
  useWorkplaceEditDetailQuery as jest.MockedFunction<
    typeof useWorkplaceEditDetailQuery
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

describe("勤務先管理のP2 UX", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockedUseQuery.mockReset();
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
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: "workplace-1", name: "青葉塾", type: "CRAM_SCHOOL" },
      }),
    } as Response);
    global.fetch = fetchMock as typeof global.fetch;

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
    global.fetch = originalFetch;
  });

  it("給与ルールの終了日が当日まで適用されることをフォームと一覧で明示する", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        id: "workplace-1",
        name: "青葉塾",
        type: "CRAM_SCHOOL",
      },
      isPending: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery>);

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
    mockedUseQuery
      .mockReturnValueOnce({
        data: { id: "workplace-1", name: "青葉塾", type: "CRAM_SCHOOL" },
        isPending: false,
        isFetching: false,
        error: null,
      } as unknown as ReturnType<typeof useQuery>)
      .mockReturnValueOnce({
        data: undefined,
        isPending: false,
        isFetching: false,
        error: null,
      } as unknown as ReturnType<typeof useQuery>);

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
});
