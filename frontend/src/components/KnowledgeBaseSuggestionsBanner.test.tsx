import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBaseSuggestionsBanner from "./KnowledgeBaseSuggestionsBanner";

describe("KnowledgeBaseSuggestionsBanner", () => {
  it("renders the inspiration message and calls onStart when clicked", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<KnowledgeBaseSuggestionsBanner onStart={onStart} />);

    expect(
      screen.getByText(/Need some inspiration for your next word to learn/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add next word" }));

    expect(onStart).toHaveBeenCalledOnce();
  });
});
