import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeAuthPage from "./WelcomeAuthPage";

const {
  signInWithPassword,
  signUpWithPassword,
  confirmSignUpAndSignIn,
  startGoogleSignIn,
  completeOAuthRedirectIfPresent,
  requestPasswordReset,
  confirmPasswordReset,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  confirmSignUpAndSignIn: vi.fn(),
  startGoogleSignIn: vi.fn(),
  completeOAuthRedirectIfPresent: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
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

vi.mock("../utils/auth/cognitoOAuth", () => ({
  startGoogleSignIn,
  completeOAuthRedirectIfPresent,
}));

vi.mock("../utils/auth/passwordResetApi", () => ({
  requestPasswordReset,
  confirmPasswordReset,
}));

describe("WelcomeAuthPage", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signUpWithPassword.mockReset();
    confirmSignUpAndSignIn.mockReset();
    startGoogleSignIn.mockReset();
    completeOAuthRedirectIfPresent.mockReset();
    requestPasswordReset.mockReset();
    confirmPasswordReset.mockReset();
    requestPasswordReset.mockResolvedValue(undefined);
    confirmPasswordReset.mockResolvedValue(undefined);
    completeOAuthRedirectIfPresent.mockResolvedValue(null);
    startGoogleSignIn.mockResolvedValue(undefined);
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

  it("shows the brand, description, login fields, and Google SSO by default", async () => {
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    expect(
      screen.getByText("Teacher Wang", { selector: ".welcome-auth-brand-mark" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Chat, track knowledge, and climb HSK\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign up — it's free" }),
    ).toBeInTheDocument();
  });

  it("starts Cognito Google SSO when Continue with Google is clicked", async () => {
    const user = userEvent.setup();
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Continue with Google" }),
    );

    expect(startGoogleSignIn).toHaveBeenCalledTimes(1);
  });

  it("completes an OAuth redirect and authenticates", async () => {
    const onAuthenticated = vi.fn();
    completeOAuthRedirectIfPresent.mockResolvedValueOnce({
      accessToken: "access",
      idToken: "id",
      refreshToken: "refresh",
    });

    render(<WelcomeAuthPage onAuthenticated={onAuthenticated} />);

    await waitFor(() => {
      expect(completeOAuthRedirectIfPresent).toHaveBeenCalled();
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
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
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
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
    expect(
      screen.queryByRole("button", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();

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

  it("walks through the forgot-password flow end to end", async () => {
    const user = userEvent.setup();
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));

    expect(
      screen.getByRole("heading", { name: "Reset your password" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset code" }));

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith("learner@example.com");
    });
    expect(
      await screen.findByRole("heading", { name: "Set a new password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/If an account with that email exists/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/learner@example\.com/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Confirmation code"), "654321");
    await user.type(screen.getByLabelText("New password"), "BrandNew1!");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(confirmPasswordReset).toHaveBeenCalledWith(
        "learner@example.com",
        "654321",
        "BrandNew1!",
      );
    });
    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Password updated/i)).toBeInTheDocument();
  });

  it("shows an error when requesting a reset code fails", async () => {
    const user = userEvent.setup();
    requestPasswordReset.mockRejectedValueOnce(new Error("Something broke."));
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something broke.");
  });

  it("returns to login from the forgot-password screen", async () => {
    const user = userEvent.setup();
    render(<WelcomeAuthPage onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Forgot your password?" }));
    await user.click(screen.getByRole("button", { name: "Back to log in" }));

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
