import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SentenceCorrectionModal from "./SentenceCorrectionModal";

describe("SentenceCorrectionModal", () => {
  it("pre-fills the field with the original sentence", () => {
    render(
      <SentenceCorrectionModal originalText="我买书。" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole("textbox", { name: "Your correction" })).toHaveValue("我买书。");
  });

  it("calls onConfirm with the edited, trimmed text when saved", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SentenceCorrectionModal originalText="我买书。" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    const textarea = screen.getByRole("textbox", { name: "Your correction" });
    await user.clear(textarea);
    await user.type(textarea, "  我买了一本书。  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onConfirm).toHaveBeenCalledWith("我买了一本书。");
  });

  it("disables Save when the field is emptied", async () => {
    const user = userEvent.setup();
    render(
      <SentenceCorrectionModal originalText="我买书。" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    await user.clear(screen.getByRole("textbox", { name: "Your correction" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <SentenceCorrectionModal originalText="我买书。" onConfirm={vi.fn()} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
