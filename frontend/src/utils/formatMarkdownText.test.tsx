import { render } from "@testing-library/react";
import { renderFormattedText } from "./formatMarkdownText";

describe("renderFormattedText", () => {
  it("renders bold, italic, and inline code", () => {
    const { container } = render(
      <p>{renderFormattedText("**bold** and *italic* and `code`")}</p>,
    );

    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("renders a Markdown header as a heading tag with the given class", () => {
    const { container } = render(
      <div>{renderFormattedText("# Basic Sentence Structure", "heading-class")}</div>,
    );

    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Basic Sentence Structure");
    expect(heading).toHaveClass("heading-class");
  });

  it("renders multiple lines, one per line", () => {
    const { container } = render(
      <div>{renderFormattedText("## Section\nSome body text.")}</div>,
    );

    expect(container.querySelector("h2")?.textContent).toBe("Section");
    expect(container.textContent).toContain("Some body text.");
  });

  it("renders a GFM table", () => {
    const markdown = [
      "| Particle | Use |",
      "| --- | --- |",
      "| 了 | completed action |",
      "| 过 | past experience |",
    ].join("\n");
    const { container } = render(<div>{renderFormattedText(markdown)}</div>);

    expect(container.querySelector("table")).toBeTruthy();
    expect(
      [...container.querySelectorAll("th")].map((th) => th.textContent),
    ).toEqual(["Particle", "Use"]);
    expect(container.querySelectorAll("td")[0]?.textContent).toBe("了");
    expect(container.querySelectorAll("td")[1]?.textContent).toBe(
      "completed action",
    );
  });

  it("renders 【brackets】 in blue", () => {
    const { container } = render(
      <div>{renderFormattedText("Use 【了】 after the verb.")}</div>,
    );

    const marked = container.querySelector("span");
    expect(marked?.textContent).toBe("了");
    expect(marked).not.toBeNull();
    expect(marked?.className).toMatch(/lenticular/);
  });

  it("colors 【brackets】 inside bold", () => {
    const { container } = render(
      <div>{renderFormattedText("**我【也】喜欢茶。** ")}</div>,
    );

    expect(container.querySelector("strong")?.textContent).toBe("我也喜欢茶。");
    const marked = [...container.querySelectorAll("span")].find((el) =>
      el.className.includes("lenticular"),
    );
    expect(marked?.textContent).toBe("也");
  });

  it("renders **【也】** as bold and blue without leftover asterisks", () => {
    const { container } = render(<div>{renderFormattedText("**【也】**")}</div>);

    expect(container.textContent).toBe("也");
    expect(container.querySelector("strong")?.textContent).toBe("也");
    const marked = [...container.querySelectorAll("span")].find((el) =>
      el.className.includes("lenticular"),
    );
    expect(marked?.textContent).toBe("也");
    expect(marked?.closest("strong")).toBeTruthy();
  });

  it("renders 【**也**】 as bold and blue without leftover asterisks", () => {
    const { container } = render(<div>{renderFormattedText("【**也**】")}</div>);

    expect(container.textContent).toBe("也");
    expect(container.querySelector("strong")?.textContent).toBe("也");
    const marked = [...container.querySelectorAll("span")].find((el) =>
      el.className.includes("lenticular"),
    );
    expect(marked?.textContent).toBe("也");
    expect(marked?.querySelector("strong")).toBeTruthy();
  });

  it("does not color 【brackets】 inside a TIP alert", () => {
    const markdown = ["> [!TIP]", "> Remember 【了】 here."].join("\n");
    const { container } = render(<div>{renderFormattedText(markdown)}</div>);

    expect(container.querySelector("aside")?.textContent).toContain("【了】");
    expect(
      [...container.querySelectorAll("span")].some((el) =>
        el.className.includes("lenticular"),
      ),
    ).toBe(false);
  });

  it("renders a GitHub-style TIP alert", () => {
    const markdown = [
      "> [!TIP]",
      "> Helpful advice for doing things better or more easily.",
    ].join("\n");
    const { container } = render(<div>{renderFormattedText(markdown)}</div>);

    expect(container.querySelector("aside")?.textContent).toContain("TIP");
    expect(container.querySelector("aside")?.textContent).toContain(
      "Helpful advice for doing things better or more easily.",
    );
  });
});
