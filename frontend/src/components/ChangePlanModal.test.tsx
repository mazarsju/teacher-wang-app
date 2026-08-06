import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangePlanModal from "./ChangePlanModal";

describe("ChangePlanModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ChangePlanModal
        isOpen={false}
        currentPlan="free"
        onClose={() => {}}
        onSwitchPlan={() => {}}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("highlights the current plan and lets you switch to the other one", async () => {
    const user = userEvent.setup();
    const onSwitchPlan = vi.fn();

    render(
      <ChangePlanModal
        isOpen
        currentPlan="free"
        onClose={() => {}}
        onSwitchPlan={onSwitchPlan}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Compare plans" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getAllByText("Included")).toHaveLength(4);
    expect(screen.getByText("Limited")).toBeInTheDocument();
    expect(screen.getByText("Generous fair use")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to Pro" }));
    expect(onSwitchPlan).toHaveBeenCalledOnce();
  });

  it("shows Pro as the current plan and offers switching to Free", () => {
    render(
      <ChangePlanModal
        isOpen
        currentPlan="pro"
        onClose={() => {}}
        onSwitchPlan={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Switch to Free" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch to Pro" }),
    ).not.toBeInTheDocument();
  });

  it("calls onClose when clicking the Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ChangePlanModal
        isOpen
        currentPlan="free"
        onClose={onClose}
        onSwitchPlan={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
