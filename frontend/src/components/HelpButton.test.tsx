import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HelpButton from "./HelpButton";

describe("HelpButton", () => {
  it("opens a bubble with a link to the Github issues page", async () => {
    const user = userEvent.setup();

    render(<HelpButton />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Help" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Github" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/mazarsju/teacher-wang-app/issues",
    );
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <button type="button">Outside</button>
        <HelpButton />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
