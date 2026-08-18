import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShiftPayrollPreviewFloating } from "@/components/shifts/ShiftPayrollPreviewFloating";

describe("ShiftPayrollPreviewFloating", () => {
  it("collapses on every breakpoint when collapseOnDesktop is enabled", async () => {
    const user = userEvent.setup();

    render(
      <ShiftPayrollPreviewFloating
        months={[]}
        years={[]}
        unresolvedCount={0}
        emptyMessage="入力中のシフトはありません"
        collapseOnDesktop
      />,
    );

    const header = screen.getByRole("button", {
      name: /支給額プレビュー/,
    });
    const detailPanel = document.getElementById(
      "shift-payroll-preview-floating-body",
    );
    if (!detailPanel) throw new Error("detail panel was not rendered");

    expect(
      within(header).getByText("入力中のシフトはありません"),
    ).toBeVisible();
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header).toHaveAttribute("aria-controls", detailPanel.id);
    expect(detailPanel).toHaveAttribute("aria-hidden", "true");
    expect(detailPanel).toHaveClass("hidden");
    expect(detailPanel).not.toHaveClass("md:block");

    await user.click(header);

    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(detailPanel).toHaveAttribute("aria-hidden", "false");
    expect(detailPanel).toHaveClass("block");

    await user.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(detailPanel).toHaveAttribute("aria-hidden", "true");
    expect(detailPanel).toHaveClass("hidden");
  });

  it("keeps the detail visible on desktop by default while retaining the mobile header toggle", async () => {
    const user = userEvent.setup();

    render(
      <ShiftPayrollPreviewFloating
        months={[]}
        years={[]}
        unresolvedCount={0}
        emptyMessage="入力中のシフトはありません"
      />,
    );

    const header = screen.getByRole("button", {
      name: /支給額プレビュー/,
    });
    const detailPanel = document.getElementById(
      "shift-payroll-preview-floating-body",
    );
    if (!detailPanel) throw new Error("detail panel was not rendered");

    expect(header).toHaveClass("md:hidden");
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header).toHaveAttribute("aria-controls", detailPanel.id);
    expect(detailPanel).toHaveClass("hidden", "md:block", "md:border-t-0");
    expect(detailPanel).not.toHaveAttribute("aria-hidden");

    await user.click(header);

    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(detailPanel).toHaveClass("block", "md:block");

    await user.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(detailPanel).toHaveClass("hidden", "md:block");
  });

  it("shows current, additional, and projected annual taxable and total amounts", () => {
    render(
      <ShiftPayrollPreviewFloating
        months={[]}
        years={[
          {
            year: 2027,
            baselineTaxableAmount: 100000,
            baselineTotalAmount: 112000,
            additionalTaxableAmount: 7000,
            additionalTotalAmount: 7480,
            projectedTaxableAmount: 107000,
            projectedTotalAmount: 119480,
          },
        ]}
        unresolvedCount={0}
        emptyMessage="入力中のシフトはありません"
      />,
    );

    const annualPreview =
      screen.getByText("年間支給額プレビュー").parentElement;
    if (!annualPreview) {
      throw new Error("annual preview was not rendered");
    }

    expect(within(annualPreview).getByText("課税合計")).toBeInTheDocument();
    expect(within(annualPreview).getByText("総支給額")).toBeInTheDocument();
    expect(within(annualPreview).getByText("現在")).toBeInTheDocument();
    expect(within(annualPreview).getByText("追加予定")).toBeInTheDocument();
    expect(within(annualPreview).getByText("登録後見込")).toBeInTheDocument();
    expect(within(annualPreview).getByText("￥100,000")).toBeInTheDocument();
    expect(within(annualPreview).getByText("￥112,000")).toBeInTheDocument();
    expect(within(annualPreview).getByText("+￥7,000")).toBeInTheDocument();
    expect(within(annualPreview).getByText("+￥7,480")).toBeInTheDocument();
    expect(within(annualPreview).getByText("￥107,000")).toBeInTheDocument();
    expect(within(annualPreview).getByText("￥119,480")).toBeInTheDocument();
  });

  it.each([
    {
      description: "is loading",
      props: { isAnnualLoading: true },
      message: "年間支給見込を取得中です。",
    },
    {
      description: "has an annual fetch error",
      props: { annualErrorMessage: "年間支給見込の取得に失敗しました。" },
      message: "年間支給見込の取得に失敗しました。",
    },
    {
      description: "receives an incomplete annual response",
      props: { isAnnualResponseIncomplete: true },
      message: "年間支給見込の取得に失敗しました。",
    },
  ])(
    "does not render misleading annual amounts when $description",
    ({ props, message }) => {
      render(
        <ShiftPayrollPreviewFloating
          months={[]}
          years={[
            {
              year: 2027,
              baselineTaxableAmount: 0,
              baselineTotalAmount: 0,
              additionalTaxableAmount: 7000,
              additionalTotalAmount: 7480,
              projectedTaxableAmount: 7000,
              projectedTotalAmount: 7480,
            },
          ]}
          unresolvedCount={0}
          emptyMessage="入力中のシフトはありません"
          {...props}
        />,
      );

      const annualPreview =
        screen.getByText("年間支給額プレビュー").parentElement;
      if (!annualPreview) {
        throw new Error("annual preview was not rendered");
      }

      expect(within(annualPreview).getByText(message)).toBeInTheDocument();
      expect(
        within(annualPreview).queryByText("2027年支給"),
      ).not.toBeInTheDocument();
      expect(within(annualPreview).queryByText("￥0")).not.toBeInTheDocument();
      expect(
        within(annualPreview).queryByText("￥7,000"),
      ).not.toBeInTheDocument();
    },
  );
});
