import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CharacterStrokeOrderModal from "./CharacterStrokeOrderModal";

describe("CharacterStrokeOrderModal", () => {
  it("renders the stroke order gif for the character's code point", () => {
    render(
      <CharacterStrokeOrderModal isOpen char="爱" onClose={() => undefined} />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      `https://www.strokeorder.com/assets/bishun/animation/${"爱".codePointAt(0)}.gif`,
    );
  });

  it("renders nothing when isOpen is false", () => {
    render(
      <CharacterStrokeOrderModal isOpen={false} char="爱" onClose={() => undefined} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<CharacterStrokeOrderModal isOpen char="爱" onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
