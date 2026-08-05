import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBaseInitWizardModal from "./KnowledgeBaseInitWizardModal";

describe("KnowledgeBaseInitWizardModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <KnowledgeBaseInitWizardModal isOpen={false} onClose={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the wizard dialog and calls onClose from the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<KnowledgeBaseInitWizardModal isOpen onClose={onClose} />);

    expect(
      screen.getByRole("heading", { name: "Build your knowledge base" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking the overlay", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<KnowledgeBaseInitWizardModal isOpen onClose={onClose} />);

    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);

    expect(onClose).toHaveBeenCalledOnce();
  });
});
