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
});
