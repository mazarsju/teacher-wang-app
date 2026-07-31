import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeAuthPage from "./WelcomeAuthPage";

const {
  signInWithPassword,
  signUpWithPassword,
  confirmSignUpAndSignIn,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  confirmSignUpAndSignIn: vi.fn(),
}));

vi.mock("../utils/auth/cognitoAuth", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../utils/auth/cognitoAuth")>();
  return {
    ...actual,
    signInWithPassword,
    signUpWithPassword,
    confirmSignUpAndSignIn,
  };
});

describe("WelcomeAuthPage", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signUpWithPassword.mockReset();
    confirmSignUpAndSignIn.mockReset();
    signInWithPassword.mockResolvedValue({
      accessToken: "access",
      idToken: "id",
      refreshToken: "refresh",
    });
    signUpWithPassword.mockResolvedValue({ userConfirmed: true });
    confirmSignUpAndSignIn.mockResolvedValue({
      accessToken: "access",
      idToken: "id",
      refreshToken: "refresh",
    });
  });

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

  it("calls Cognito sign-in then onAuthenticated after a valid login submit", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith("learner", "Secret123");
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it("calls Cognito sign-up then signs in when the user is already confirmed", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("button", { name: "Sign up — it's free" }));
    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUpWithPassword).toHaveBeenCalledWith(
        "learner",
        "learner@example.com",
        "Secret123",
      );
      expect(signInWithPassword).toHaveBeenCalledWith("learner", "Secret123");
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it("asks for an email confirmation code when Cognito requires it", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    signUpWithPassword.mockResolvedValueOnce({
      userConfirmed: false,
      codeDeliveryDestination: "l***@example.com",
    });

    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("button", { name: "Sign up — it's free" }));
    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { name: "Confirm your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/We sent a code to l\*\*\*@example.com/i)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Confirmation code"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm and log in" }));

    await waitFor(() => {
      expect(confirmSignUpAndSignIn).toHaveBeenCalledWith(
        "learner",
        "123456",
        "Secret123",
      );
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it("shows Cognito errors on failed login", async () => {
    const user = userEvent.setup();
    const { CognitoAuthError } = await import("../utils/auth/cognitoAuth");
    signInWithPassword.mockRejectedValueOnce(
      new CognitoAuthError("NotAuthorizedException", "Incorrect username or password."),
    );

    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Incorrect username or password.");
  });

  it("does not authenticate when required login fields are empty", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(signInWithPassword).not.toHaveBeenCalled();
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
