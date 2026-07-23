import { render, screen } from "@testing-library/react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { RefreshStatusFloating } from "@/components/ui/refresh-status-floating";

describe("LoadingOverlay", () => {
  it("keeps content interactive when blockInteraction is false", () => {
    render(
      <LoadingOverlay isLoading blockInteraction={false}>
        <button type="button">続けて操作する</button>
      </LoadingOverlay>,
    );

    const button = screen.getByRole("button", { name: "続けて操作する" });
    const content = button.parentElement;
    const root = content?.parentElement;
    const overlay = screen
      .getByText("最新データを更新中...")
      .closest("div")?.parentElement;

    if (
      !(content instanceof HTMLElement) ||
      !(root instanceof HTMLElement) ||
      !(overlay instanceof HTMLElement)
    ) {
      throw new Error("loading overlay elements were not found");
    }

    expect(root).toHaveAttribute("aria-busy", "true");
    expect(content).not.toHaveClass("pointer-events-none");
    expect(overlay).toHaveClass("pointer-events-none");
  });

  it("blocks content interaction by default while loading", () => {
    render(
      <LoadingOverlay isLoading>
        <button type="button">既定ブロック</button>
      </LoadingOverlay>,
    );

    const button = screen.getByRole("button", { name: "既定ブロック" });
    const content = button.parentElement;
    const overlay = screen
      .getByText("最新データを更新中...")
      .closest("div")?.parentElement;

    if (
      !(content instanceof HTMLElement) ||
      !(overlay instanceof HTMLElement)
    ) {
      throw new Error("loading overlay elements were not found");
    }

    expect(content).toHaveClass("pointer-events-none");
    expect(overlay).not.toHaveClass("pointer-events-none");
  });

  it("renders a non-interactive fixed refresh status", () => {
    render(<RefreshStatusFloating />);

    const floating = screen.getByLabelText("更新中");
    expect(floating.tagName).toBe("ASIDE");
    expect(floating).toHaveClass("fixed", "pointer-events-none");
    expect(screen.getByText("更新中")).toBeInTheDocument();
    expect(screen.getByText("更新中").parentElement).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
