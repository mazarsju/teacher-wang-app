import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WritingPracticeDetailPage from "./WritingPracticeDetailPage";

describe("WritingPracticeDetailPage", () => {
  it("shows the topic title and its context by default", () => {
    render(
      <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", { name: "Present yourself" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Context", selected: true })).toBeInTheDocument();
    expect(screen.getByText(/Write a short introduction of yourself/)).toBeInTheDocument();
    expect(screen.getByText("Grammar you can use")).toBeInTheDocument();
  });

  it("shows a fallback message when a topic has no context file", () => {
    render(<WritingPracticeDetailPage topicId="writing-unknown" onBack={vi.fn()} />);

    expect(screen.getByText("No context available yet.")).toBeInTheDocument();
  });

  it("switches to the writing tab and lets the user type multi-line text", async () => {
    const user = userEvent.setup();
    render(
      <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
    );

    await user.click(screen.getByRole("tab", { name: "Writing" }));

    const textarea = screen.getByLabelText("Your writing");
    expect(textarea).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();

    await user.type(textarea, "你好{Enter}再见");
    expect(textarea).toHaveValue("你好\n再见");
  });

  it("calls onBack when the back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={onBack} />,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalled();
  });
});
