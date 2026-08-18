import { render, screen, within } from "@testing-library/react";
import { BulkShiftEditPayrollPreviewFloating } from "@/components/shifts/BulkShiftEditPayrollPreviewFloating";

const changedMonth = {
  month: "2026-03",
  baselineWage: 10000,
  baselineTransportationAllowance: 1000,
  baselineTotalAmount: 11000,
  differenceWage: 1000,
  differenceTransportationAllowance: 480,
  differenceTotalAmount: 1480,
  projectedWage: 11000,
  projectedTransportationAllowance: 1480,
  projectedTotalAmount: 12480,
  changeCount: 1,
  unresolvedCount: 0,
  messages: [],
};

function renderChangedMonthPreview(input?: {
  isBaselineLoading?: boolean;
  baselineErrorMessage?: string | null;
}) {
  render(
    <BulkShiftEditPayrollPreviewFloating
      months={[changedMonth]}
      years={[]}
      unresolvedCount={0}
      isBaselineLoading={input?.isBaselineLoading ?? false}
      baselineErrorMessage={input?.baselineErrorMessage ?? null}
      isAnnualLoading={false}
      annualErrorMessage={null}
      isAnnualResponseIncomplete={false}
    />,
  );
}

describe("BulkShiftEditPayrollPreviewFloating", () => {
  it("guides the user before any editable value has changed", () => {
    render(
      <BulkShiftEditPayrollPreviewFloating
        months={[]}
        years={[]}
        unresolvedCount={0}
        isBaselineLoading={false}
        baselineErrorMessage={null}
        isAnnualLoading={false}
        annualErrorMessage={null}
        isAnnualResponseIncomplete={false}
      />,
    );

    expect(
      screen.getAllByText("勤務内容を変更すると支給額への影響を確認できます"),
    ).not.toHaveLength(0);
  });

  it("shows before, difference, projected totals and their wage and transportation breakdowns", () => {
    render(
      <BulkShiftEditPayrollPreviewFloating
        months={[
          {
            month: "2026-03",
            baselineWage: 10000,
            baselineTransportationAllowance: 1000,
            baselineTotalAmount: 11000,
            differenceWage: 1000,
            differenceTransportationAllowance: 480,
            differenceTotalAmount: 1480,
            projectedWage: 11000,
            projectedTransportationAllowance: 1480,
            projectedTotalAmount: 12480,
            changeCount: 1,
            unresolvedCount: 0,
            messages: [],
          },
          {
            month: "2026-04",
            baselineWage: 9000,
            baselineTransportationAllowance: 500,
            baselineTotalAmount: 9500,
            differenceWage: -1000,
            differenceTransportationAllowance: 0,
            differenceTotalAmount: -1000,
            projectedWage: 8000,
            projectedTransportationAllowance: 500,
            projectedTotalAmount: 8500,
            changeCount: 1,
            unresolvedCount: 1,
            messages: ["終了時刻を入力してください。"],
          },
        ]}
        years={[]}
        unresolvedCount={1}
        isBaselineLoading={false}
        baselineErrorMessage={null}
        isAnnualLoading={false}
        annualErrorMessage={null}
        isAnnualResponseIncomplete={false}
      />,
    );

    const march = screen.getByText("2026年3月支給").parentElement;
    if (!march) throw new Error("March preview was not rendered");
    expect(within(march).getByText("変更前")).toBeInTheDocument();
    expect(within(march).getByText("差分")).toBeInTheDocument();
    expect(within(march).getByText("変更後")).toBeInTheDocument();
    expect(within(march).getByText("￥11,000")).toBeInTheDocument();
    expect(within(march).getByText("+￥1,480")).toBeInTheDocument();
    expect(within(march).getByText("￥12,480")).toBeInTheDocument();
    expect(
      within(march).getByText("給与 +￥1,000 / 交通費 +￥480"),
    ).toBeInTheDocument();

    const april = screen.getByText("2026年4月支給").parentElement;
    if (!april) throw new Error("April preview was not rendered");
    expect(within(april).getByText("-￥1,000")).toBeInTheDocument();
    expect(
      within(april).getByText("対象変更: 1件 / 未計算: 1件"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "入力途中のため、差分に含めていない行があります（1件）。",
      ),
    ).toBeInTheDocument();
  });

  it("shows only the difference while the monthly baseline is loading", () => {
    renderChangedMonthPreview({ isBaselineLoading: true });

    const month = screen.getByText("2026年3月支給").parentElement;
    if (!month) throw new Error("month preview was not rendered");
    expect(
      screen.getByText("現在の支給見込を取得中です。"),
    ).toBeInTheDocument();
    expect(within(month).getByText("差分")).toBeInTheDocument();
    expect(within(month).getByText("+￥1,480")).toBeInTheDocument();
    expect(within(month).queryByText("変更前")).not.toBeInTheDocument();
    expect(within(month).queryByText("変更後")).not.toBeInTheDocument();
    expect(within(month).queryByText("￥11,000")).not.toBeInTheDocument();
    expect(within(month).queryByText("￥12,480")).not.toBeInTheDocument();
  });

  it("shows the warning and difference without misleading monthly totals when baseline retrieval fails", () => {
    renderChangedMonthPreview({
      baselineErrorMessage:
        "現在の支給見込の取得に失敗しました。差分のみ表示しています。",
    });

    const month = screen.getByText("2026年3月支給").parentElement;
    if (!month) throw new Error("month preview was not rendered");
    expect(
      screen.getByText(
        "現在の支給見込の取得に失敗しました。差分のみ表示しています。",
      ),
    ).toBeInTheDocument();
    expect(within(month).getByText("差分")).toBeInTheDocument();
    expect(within(month).getByText("+￥1,480")).toBeInTheDocument();
    expect(within(month).queryByText("変更前")).not.toBeInTheDocument();
    expect(within(month).queryByText("変更後")).not.toBeInTheDocument();
    expect(within(month).queryByText("￥11,000")).not.toBeInTheDocument();
    expect(within(month).queryByText("￥12,480")).not.toBeInTheDocument();
  });

  it("keeps actual-payroll-covered changes out of the annual difference and explains why", () => {
    render(
      <BulkShiftEditPayrollPreviewFloating
        months={[]}
        years={[
          {
            year: 2026,
            baselineTaxableAmount: 120000,
            baselineTotalAmount: 130000,
            differenceTaxableAmount: 0,
            differenceTotalAmount: 0,
            projectedTaxableAmount: 120000,
            projectedTotalAmount: 130000,
            actualPayrollExcludedCount: 1,
          },
        ]}
        unresolvedCount={0}
        isBaselineLoading={false}
        baselineErrorMessage={null}
        isAnnualLoading={false}
        annualErrorMessage={null}
        isAnnualResponseIncomplete={false}
      />,
    );

    const annualPreview = screen.getByText("年間支給額への影響").parentElement;
    if (!annualPreview) throw new Error("annual preview was not rendered");
    expect(within(annualPreview).getByText("給与")).toBeInTheDocument();
    expect(within(annualPreview).getByText("総支給額")).toBeInTheDocument();
    expect(
      within(annualPreview).getByText(
        "実給与登録済みの 1件分は差分に含めていません。",
      ),
    ).toBeInTheDocument();
    expect(within(annualPreview).getAllByText("￥120,000")).toHaveLength(2);
    expect(within(annualPreview).getAllByText("￥130,000")).toHaveLength(2);
  });
});
