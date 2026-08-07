import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PinyinGridView, {
  chunkCharacters,
  getColumnMinWidthCh,
} from "./PinyinGridView";
import { FINAL, START } from "../types/pinyin";

describe("PinyinGridView helpers", () => {
  it("uses at least three characters of width for short finals", () => {
    expect(getColumnMinWidthCh("a")).toBe(3);
    expect(getColumnMinWidthCh("iang")).toBe(4);
  });

  it("chunks characters into lines of three", () => {
    expect(chunkCharacters(["爱", "艾", "矮", "碍"])).toEqual(["爱艾矮", "碍"]);
  });
});

describe("PinyinGridView", () => {
  it("places characters in the matching start and final cell", () => {
    render(
      <PinyinGridView
        characters={[
          {
            char: "爱",
            pinyin: "ai4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "好",
            pinyin: "hao3",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "ai" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "h" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "爱" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "好" })).toBeInTheDocument();
  });

  it("wraps more than three characters onto multiple lines", () => {
    const { container } = render(
      <PinyinGridView
        characters={[
          {
            char: "爱",
            pinyin: "ai4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "艾",
            pinyin: "ai4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "矮",
            pinyin: "ai4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "碍",
            pinyin: "ai4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
        ]}
      />,
    );

    expect(screen.getByRole("cell", { name: "爱艾矮碍" })).toBeInTheDocument();
    expect(container.querySelectorAll(".pinyin-grid-cell-line")).toHaveLength(2);
  });

  it("colors characters according to their tone", () => {
    const { container } = render(
      <PinyinGridView
        characters={[
          {
            char: "妈",
            pinyin: "ma1",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "麻",
            pinyin: "ma2",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "马",
            pinyin: "ma3",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "骂",
            pinyin: "ma4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "吗",
            pinyin: "ma",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
        ]}
      />,
    );

    expect(container.querySelector(".pinyin-grid-char-tone-1")).toHaveTextContent(
      "妈",
    );
    expect(container.querySelector(".pinyin-grid-char-tone-2")).toHaveTextContent(
      "麻",
    );
    expect(container.querySelector(".pinyin-grid-char-tone-3")).toHaveTextContent(
      "马",
    );
    expect(container.querySelector(".pinyin-grid-char-tone-4")).toHaveTextContent(
      "骂",
    );
    expect(container.querySelector(".pinyin-grid-char-tone-none")).toHaveTextContent(
      "吗",
    );
  });

  it("renders clickable buttons only for characters with associated words", () => {
    const onCharacterClick = vi.fn();

    render(
      <PinyinGridView
        characters={[
          {
            char: "爱",
            pinyin: "ai4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
          {
            char: "好",
            pinyin: "hao3",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
        ]}
        characterHasWords={(char) => char === "爱"}
        onCharacterClick={onCharacterClick}
      />,
    );

    expect(
      screen.getByRole("button", { name: "爱 associated words" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "好 associated words" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("calls onCharacterClick when a clickable character is pressed", async () => {
    const user = userEvent.setup();
    const onCharacterClick = vi.fn();

    render(
      <PinyinGridView
        characters={[
          {
            char: "爱",
            pinyin: "ai4",
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
        ]}
        characterHasWords={() => true}
        onCharacterClick={onCharacterClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "爱 associated words" }));

    expect(onCharacterClick).toHaveBeenCalledWith("爱", "ai4");
  });

  it("inserts a character once per pinyin reading, in the matching cell for each", async () => {
    const user = userEvent.setup();
    const onCharacterClick = vi.fn();

    render(
      <PinyinGridView
        characters={[
          {
            char: "的",
            pinyin: "de",
            pinyin_readings: ["de", "di4"],
            writing_known: true,
            updated_at: "2026-07-12T12:00:00+00:00",
          },
        ]}
        characterHasWords={() => true}
        onCharacterClick={onCharacterClick}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "的 associated words" });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[0]);
    await user.click(buttons[1]);

    expect(onCharacterClick).toHaveBeenCalledWith("的", "de");
    expect(onCharacterClick).toHaveBeenCalledWith("的", "di4");
  });

  it("marks invalid pinyin cells and keeps them unhighlighted on hover", () => {
    const { container } = render(<PinyinGridView characters={[]} />);
    const bRowIndex = START.indexOf("b");
    const eColIndex = FINAL.indexOf("e");
    const invalidCell = container.querySelector(
      `tbody tr:nth-child(${bRowIndex + 1}) td:nth-child(${eColIndex + 2})`,
    );
    const validCellInSameRow = container.querySelector(
      `tbody tr:nth-child(${bRowIndex + 1}) td:nth-child(${FINAL.indexOf("ei") + 2})`,
    );

    expect(invalidCell).toHaveClass("pinyin-grid-cell-invalid");

    fireEvent.mouseEnter(validCellInSameRow!);
    expect(invalidCell).not.toHaveClass("pinyin-grid-cell-highlight");
    expect(validCellInSameRow).toHaveClass("pinyin-grid-cell-highlight");

    fireEvent.mouseEnter(invalidCell!);
    expect(invalidCell).not.toHaveClass("pinyin-grid-cell-highlight");
  });

  it("highlights the hovered row and column for valid cells", () => {
    const { container } = render(<PinyinGridView characters={[]} />);
    const hRowIndex = START.indexOf("h");
    const aoColIndex = FINAL.indexOf("ao");
    const hoveredCell = container.querySelector(
      `tbody tr:nth-child(${hRowIndex + 1}) td:nth-child(${aoColIndex + 2})`,
    );
    const sameRowCell = container.querySelector(
      `tbody tr:nth-child(${hRowIndex + 1}) td:nth-child(${FINAL.indexOf("ai") + 2})`,
    );
    const sameColumnCell = container.querySelector(
      `tbody tr:nth-child(${START.indexOf("b") + 1}) td:nth-child(${aoColIndex + 2})`,
    );
    const unrelatedCell = container.querySelector(
      `tbody tr:nth-child(${START.indexOf("b") + 1}) td:nth-child(${FINAL.indexOf("ei") + 2})`,
    );

    fireEvent.mouseEnter(hoveredCell!);

    expect(hoveredCell).toHaveClass("pinyin-grid-cell-highlight");
    expect(sameRowCell).toHaveClass("pinyin-grid-cell-highlight");
    expect(sameColumnCell).toHaveClass("pinyin-grid-cell-highlight");
    expect(unrelatedCell).not.toHaveClass("pinyin-grid-cell-highlight");
  });
});
