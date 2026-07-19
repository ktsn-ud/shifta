import { render, screen } from "@testing-library/react";
import { PayrollRuleList } from "@/components/workplaces/payroll-rule-list";
import { WorkplaceList } from "@/components/workplaces/workplace-list";
import {
  useWorkplaceDetailQuery,
  useWorkplacePayrollRulesQuery,
  useWorkplacesQuery,
} from "@/lib/query/queries/workplaces";

jest.mock("@/lib/query/queries/workplaces", () => ({
  useWorkplaceDetailQuery: jest.fn(),
  useWorkplacePayrollRulesQuery: jest.fn(),
  useWorkplacesQuery: jest.fn(),
}));

jest.mock("@/lib/query/query-client", () => ({
  getBrowserQueryClient: jest.fn(() => ({
    setQueryData: jest.fn(),
  })),
}));

const mockedUseWorkplacesQuery = useWorkplacesQuery as jest.MockedFunction<
  typeof useWorkplacesQuery
>;
const mockedUseWorkplaceDetailQuery =
  useWorkplaceDetailQuery as jest.MockedFunction<
    typeof useWorkplaceDetailQuery
  >;
const mockedUseWorkplacePayrollRulesQuery =
  useWorkplacePayrollRulesQuery as jest.MockedFunction<
    typeof useWorkplacePayrollRulesQuery
  >;

describe("勤務先設定の横スクロールヒント", () => {
  beforeEach(() => {
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
    mockedUseWorkplacePayrollRulesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useWorkplacePayrollRulesQuery>);
  });

  it("勤務先一覧に横スクロールのヒントを表示する", () => {
    render(<WorkplaceList currentUserId="user-1" initialWorkplaces={[]} />);

    expect(
      screen.getByText("表は横にスクロールして確認できます。"),
    ).toBeInTheDocument();
  });

  it("給与ルール一覧に横スクロールのヒントを表示する", () => {
    render(
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
      screen.getByText("表は横にスクロールして確認できます。"),
    ).toBeInTheDocument();
  });
});
