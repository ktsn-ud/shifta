import RootLayout from "@/app/layout";

describe("app/layout", () => {
  it("html に data-scroll-behavior を設定する", () => {
    const result = RootLayout({
      children: <div>child</div>,
    });

    expect(result.type).toBe("html");
    expect(result.props["data-scroll-behavior"]).toBe("smooth");
  });
});
