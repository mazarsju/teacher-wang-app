import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WritingReviewModal from "./WritingReviewModal";

describe("WritingReviewModal", () => {
  it("plays the success confetti and lists grammar points when everything is correct", () => {
    render(
      <WritingReviewModal
        allCorrect
        grammarPointTitles={["Existence with 有"]}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Everything is correct!" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Existence with 有")).toBeInTheDocument();
    // ChallengeConfetti portals its particle burst to document.body when active.
    expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("does not play confetti and warns the user when there are mistakes", () => {
    render(
      <WritingReviewModal
        allCorrect={false}
        grammarPointTitles={["Existence with 有"]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Almost there" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Some sentences still have grammar mistakes. Click them to see why, then fix them to validate the text.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Existence with 有")).toBeInTheDocument();
    expect(screen.getByRole("dialog").className).toContain("modal-dialog--warning");
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it("omits the grammar points list when none were covered", () => {
    render(<WritingReviewModal allCorrect grammarPointTitles={[]} onClose={vi.fn()} />);

    expect(screen.queryByText("Grammar points you used correctly:")).not.toBeInTheDocument();
  });

  it("calls onClose when the OK button or the overlay is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <WritingReviewModal allCorrect grammarPointTitles={[]} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
