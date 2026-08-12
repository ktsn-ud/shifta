import RootLayout from "@/app/layout";
import type { ReactElement } from "react";

type LinkElement = ReactElement<{
  crossOrigin?: string;
  href?: string;
  rel?: string;
}>;

describe("app/layout", () => {
  it("既存の html 属性を維持する", () => {
    const result = RootLayout({
      children: <div>child</div>,
    });

    expect(result.type).toBe("html");
    expect(result.props.lang).toBe("ja");
    expect(result.props["data-scroll-behavior"]).toBe("smooth");
    expect(result.props.suppressHydrationWarning).toBe(true);
  });

  it("Gen Interface JP の必要な CDN stylesheet だけを head に追加する", () => {
    const result = RootLayout({
      children: <div>child</div>,
    });
    const [head] = result.props.children;
    const links = head.props.children as LinkElement[];
    const preconnect = links.find((link) => link.props.rel === "preconnect");
    const stylesheetHrefs = links
      .filter((link) => link.props.rel === "stylesheet")
      .map((link) => link.props.href);
    const expectedStylesheetHrefs = [
      "https://cdn.jsdelivr.net/npm/gen-interface-jp@0.8.0/cdn/400.css",
      "https://cdn.jsdelivr.net/npm/gen-interface-jp@0.8.0/cdn/500.css",
      "https://cdn.jsdelivr.net/npm/gen-interface-jp@0.8.0/cdn/600.css",
      "https://cdn.jsdelivr.net/npm/gen-interface-jp@0.8.0/cdn/700.css",
      "https://cdn.jsdelivr.net/npm/gen-interface-jp@0.8.0/cdn/display-600.css",
    ];

    expect(head.type).toBe("head");
    expect(preconnect).toMatchObject({
      type: "link",
      props: {
        rel: "preconnect",
        href: "https://cdn.jsdelivr.net",
        crossOrigin: "anonymous",
      },
    });
    expect(stylesheetHrefs).toEqual(
      expect.arrayContaining(expectedStylesheetHrefs),
    );
    expect(stylesheetHrefs).toHaveLength(expectedStylesheetHrefs.length);
    expect(stylesheetHrefs).not.toContain(
      "https://cdn.jsdelivr.net/npm/gen-interface-jp@0.8.0/cdn/all.css",
    );
  });
});
