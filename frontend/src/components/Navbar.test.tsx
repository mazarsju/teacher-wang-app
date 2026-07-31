import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "./Navbar";

describe("Navbar", () => {
  it("renders all navigation tabs", () => {
    render(<Navbar activePage="home" onPageChange={() => {}} onLogout={() => {}} />);

    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Knowledge base" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chat" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preferences" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Profile menu" }),
    ).toBeInTheDocument();
  });

  it("marks the active tab and calls onPageChange when another tab is clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(<Navbar activePage="home" onPageChange={onPageChange} onLogout={() => {}} />);

    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("button", { name: "Chat" }));

    expect(onPageChange).toHaveBeenCalledWith("chat");
  });
});
