import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileMenu from "./ProfileMenu";

describe("ProfileMenu", () => {
  it("opens a dropdown with Log out and calls onLogout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();

    render(<ProfileMenu onLogout={onLogout} />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Profile menu" }));

    expect(screen.getByRole("menu", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Log out/i })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Log out/i }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <button type="button">Outside</button>
        <ProfileMenu onLogout={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
