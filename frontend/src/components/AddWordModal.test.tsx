import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddWordModal from "./AddWordModal";

describe("AddWordModal", () => {
  it("shows a warning and disables confirm when the word already exists", async () => {
    const user = userEvent.setup();

    render(
      <AddWordModal
        mode="add"
        isOpen
        existingWords={["爱好"]}
        hskCharacterPinyin={{}}
        characterPinyin={{}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");

    expect(
      screen.getByText("This word already exists in the database."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("allows non-Chinese characters in the word", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{ 想: "xiang3" }}
        characterPinyin={{}}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "A想B");
    await user.type(screen.getByLabelText("definition"), "to think");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledWith({
      word: "A想B",
      definition: "to think",
      pinyin: "A xiang3 B",
    });
  });

  it("auto-fills the pinyin from known HSK character readings while typing the word", async () => {
    const user = userEvent.setup();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{ 爱: "ai4", 好: "hao3" }}
        characterPinyin={{}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");

    expect(screen.getByLabelText("pinyin")).toHaveValue("ai4 hao3");
  });

  it("falls back to the user's own character table when a character is missing from HSK", async () => {
    const user = userEvent.setup();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{ 爱: "ai4" }}
        characterPinyin={{ 好: "hao3" }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");

    expect(screen.getByLabelText("pinyin")).toHaveValue("ai4 hao3");
  });

  it("auto-fills '??' for Chinese characters missing from both the HSK map and the user's own characters", async () => {
    const user = userEvent.setup();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{ 爱: "ai4" }}
        characterPinyin={{}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");

    expect(screen.getByLabelText("pinyin")).toHaveValue("ai4 ??");
  });

  it("submits the word when all characters exist", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{ 爱: "ai4", 好: "hao3" }}
        characterPinyin={{}}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");
    await user.type(screen.getByLabelText("definition"), "to like");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledWith({
      word: "爱好",
      definition: "to like",
      pinyin: "ai4 hao3",
    });
  });

  it("disables confirm while pinyin is empty", async () => {
    const user = userEvent.setup();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{ 爱: "ai4", 好: "hao3" }}
        characterPinyin={{}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");
    await user.type(screen.getByLabelText("definition"), "to like");
    await user.clear(screen.getByLabelText("pinyin"));

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("disables confirm while definition is empty", async () => {
    const user = userEvent.setup();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{ 爱: "ai4", 好: "hao3" }}
        characterPinyin={{}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("shows a warning and disables confirm when the pinyin doesn't match the word", async () => {
    const user = userEvent.setup();

    render(
      <AddWordModal
        mode="add"
        isOpen
        hskCharacterPinyin={{}}
        characterPinyin={{}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("words"), "爱好");
    await user.clear(screen.getByLabelText("pinyin"));
    await user.type(screen.getByLabelText("pinyin"), "aihao");

    expect(
      screen.getByText(
        /Enter one valid pinyin syllable per Chinese character/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("matches non-Chinese characters in the word literally against the pinyin", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AddWordModal
        mode="edit"
        isOpen
        initialWord={{
          word: "A想B",
          definition: null,
          pinyin: null,
          updated_at: "2026-07-12T12:00:00+00:00",
          characters: ["A", "想", "B"],
        }}
        hskCharacterPinyin={{}}
        characterPinyin={{}}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("pinyin"), "A xiang3 B");
    await user.type(screen.getByLabelText("definition"), "to think");

    expect(
      screen.queryByText(/Enter one valid pinyin syllable per Chinese character/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledWith({
      word: "A想B",
      definition: "to think",
      pinyin: "A xiang3 B",
    });
  });

  it("submits edited definition in edit mode", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AddWordModal
        mode="edit"
        isOpen
        initialWord={{
          word: "爱好",
          definition: "old",
          pinyin: "ai4 hao3",
          updated_at: "2026-07-12T12:00:00+00:00",
          characters: ["爱", "好"],
        }}
        hskCharacterPinyin={{}}
        characterPinyin={{}}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("爱好")).toHaveAttribute("readonly");
    await user.clear(screen.getByLabelText("definition"));
    await user.type(screen.getByLabelText("definition"), "hobby");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledWith({
      word: "爱好",
      definition: "hobby",
      pinyin: "ai4 hao3",
    });
  });
});
