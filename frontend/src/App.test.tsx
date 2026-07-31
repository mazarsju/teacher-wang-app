import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const { signInWithPassword, hasStoredSession } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  hasStoredSession: vi.fn(() => false),
}));

vi.mock("./utils/auth/cognitoAuth", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./utils/auth/cognitoAuth")>();
  return {
    ...actual,
    signInWithPassword,
  };
});

vi.mock("./utils/auth/tokenStorage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./utils/auth/tokenStorage")>();
  return {
    ...actual,
    hasStoredSession,
  };
});

describe("App", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    hasStoredSession.mockReset();
    hasStoredSession.mockReturnValue(false);
    signInWithPassword.mockResolvedValue({
      accessToken: "access",
      idToken: "id",
      refreshToken: "refresh",
    });
  });

  it("lands on the welcome auth screen first", () => {
    render(<App />);

    expect(
      screen.getByText("Teacher Wang", { selector: ".welcome-auth-brand-mark" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("enters the app after Cognito login and switches tabs", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith("learner", "Secret123");
      expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chat" }));

    expect(screen.getByRole("heading", { name: "Chat" })).toBeInTheDocument();
  });
});
