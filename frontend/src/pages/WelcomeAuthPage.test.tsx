import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeAuthPage from "./WelcomeAuthPage";

describe("WelcomeAuthPage", () => {
  it("shows the brand, description, and login fields by default", () => {
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    expect(
      screen.getByText("Teacher Wang", { selector: ".welcome-auth-brand-mark" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Practice Mandarin with characters you already know/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign up — it's free" }),
    ).toBeInTheDocument();
  });

  it("switches to sign-up mode with email and free account messaging", async () => {
    const user = userEvent.setup();
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Sign up — it's free" }));

    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("calls onAuthenticated after a valid login submit", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("calls onAuthenticated after a valid sign-up submit", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("button", { name: "Sign up — it's free" }));
    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("does not authenticate when required login fields are empty", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("returns to login mode from sign-up", async () => {
    const user = userEvent.setup();
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Sign up — it's free" }));
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
});
