import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WarningModal from "./WarningModal";

describe("WarningModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <WarningModal isOpen={false} message="Something went wrong." onClose={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the warning message and calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <WarningModal
        isOpen
        message="Couldn't determine the pinyin for these characters."
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Warning" })).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't determine the pinyin for these characters."),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
