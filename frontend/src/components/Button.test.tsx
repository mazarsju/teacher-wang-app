import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";

describe("Button", () => {
  it("renders the text and calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button kind="confirm" text="Save mapping" onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Save mapping" });
    await user.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies the kind and variant classes", () => {
    render(<Button kind="danger" variant="table" text="Delete" />);

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "btn",
      "btn-danger",
      "btn-table",
    );
  });

  it("defaults to the modal variant and type=button", () => {
    render(<Button kind="cancel" text="Cancel" />);

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveClass("btn-modal");
    expect(button).toHaveAttribute("type", "button");
  });

  it("supports type=submit and disabled", () => {
    render(<Button kind="confirm" text="Confirm" htmlType="submit" disabled />);

    const button = screen.getByRole("button", { name: "Confirm" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeDisabled();
  });

  it("renders an icon before the text and merges a custom className", () => {
    render(
      <Button
        kind="cancel"
        text="Export"
        icon={<span data-testid="icon" />}
        className="extra"
      />,
    );

    const button = screen.getByRole("button", { name: "Export" });
    expect(button).toHaveClass("extra");
    expect(button.querySelector('[data-testid="icon"]')).toBeInTheDocument();
  });
});
