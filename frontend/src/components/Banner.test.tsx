import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Banner from "./Banner";

describe("Banner", () => {
  it("renders the message and calls actionOnButtonClick when the button is clicked", async () => {
    const user = userEvent.setup();
    const actionOnButtonClick = vi.fn();

    render(
      <Banner
        type="info"
        message="Need some inspiration for your next word to learn?"
        buttonMessage="Add next word"
        actionOnButtonClick={actionOnButtonClick}
      />,
    );

    expect(
      screen.getByText("Need some inspiration for your next word to learn?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add next word" }));

    expect(actionOnButtonClick).toHaveBeenCalledOnce();
  });

  it("applies the warning style class for type warning", () => {
    render(
      <Banner
        type="warning"
        message="You're running out of AI usage for the month."
        buttonMessage="Update plan"
        actionOnButtonClick={() => {}}
      />,
    );

    expect(screen.getByRole("status")).toHaveClass("app-banner--warning");
  });
});
