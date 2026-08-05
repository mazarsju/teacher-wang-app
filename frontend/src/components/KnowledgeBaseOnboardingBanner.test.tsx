import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBaseOnboardingBanner from "./KnowledgeBaseOnboardingBanner";

describe("KnowledgeBaseOnboardingBanner", () => {
  it("renders the onboarding message and calls onStart when clicked", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(<KnowledgeBaseOnboardingBanner onStart={onStart} />);

    expect(
      screen.getByText(/Struggling with setting up your knowledge base/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Start building your knowledge base" }),
    );

    expect(onStart).toHaveBeenCalledOnce();
  });
});
