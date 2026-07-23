import { render, screen } from "@testing-library/react";
import { WorkplaceContextBreadcrumb } from "@/components/workplaces/workplace-context-breadcrumb";

describe("WorkplaceContextBreadcrumb", () => {
  it("デスクトップでは勤務先一覧・勤務先名・現在の設定画面を表示する", () => {
    render(
      <WorkplaceContextBreadcrumb
        workplaceId="workplace-1"
        workplaceName="青葉塾"
        currentPage="給与ルール"
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "勤務先設定の現在地" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "勤務先一覧" })).toHaveAttribute(
      "href",
      "/my/workplaces",
    );
    expect(screen.getByRole("link", { name: "青葉塾" })).toHaveAttribute(
      "href",
      "/my/workplaces/workplace-1/edit",
    );
    expect(screen.getByText("給与ルール")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("モバイルでは勤務先名と現在の設定画面を省略しない", () => {
    render(
      <WorkplaceContextBreadcrumb
        workplaceId="workplace-1"
        workplaceName="青葉塾"
        currentPage="時間割"
      />,
    );

    expect(
      screen.getByRole("link", { name: "勤務先一覧" }).closest("li"),
    ).toHaveClass("hidden", "sm:block");
    expect(
      screen.getByRole("link", { name: "青葉塾" }).closest("li"),
    ).not.toHaveClass("hidden");
    expect(screen.getByText("時間割").closest("li")).not.toHaveClass("hidden");
  });
});
