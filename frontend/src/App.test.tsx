import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { renderWithStore } from "./test/renderWithStore";

const {
  signInWithPassword,
  hasStoredSession,
  clearCognitoTokens,
} = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  hasStoredSession: vi.fn(() => false),
  clearCognitoTokens: vi.fn(),
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
    clearCognitoTokens,
  };
});

function stubAuthenticatedApis() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/characters")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }

      if (url.includes("/words")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }

      if (url.includes("/hsk-level")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            current_level: null,
            next_level: 1,
            characters_to_next_level: 1,
            progress_to_next_level: 0,
            missing_characters: [],
            max_level: 7,
            completion_ratio: 0.85,
          }),
        });
      }

      if (url.includes("/anki/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            synchronization_status: "not_synchronized",
            pending_push_estimate: 0,
            decks: {
              mandarin_vocabulary: {
                status: "not_configured",
                deck_name: "",
                model_name: "",
                fields: {},
              },
              mandarin_writting: {
                status: "not_configured",
                deck_name: "",
                model_name: "",
                fields: {},
              },
            },
          }),
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({}),
      });
    }),
  );
}

describe("App", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    hasStoredSession.mockReset();
    clearCognitoTokens.mockReset();
    hasStoredSession.mockReturnValue(false);
    signInWithPassword.mockResolvedValue({
      accessToken: "access",
      idToken: "id",
      refreshToken: "refresh",
    });
    stubAuthenticatedApis();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lands on the welcome auth screen first", () => {
    renderWithStore(<App />);

    expect(
      screen.getByText("Teacher Wang", { selector: ".welcome-auth-brand-mark" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("enters the app after Cognito login and switches tabs", async () => {
    const user = userEvent.setup();

    renderWithStore(<App />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith("learner", "Secret123");
      expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    });
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Profile menu" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chat" }));

    expect(screen.getByRole("heading", { name: "Chat" })).toBeInTheDocument();
  });

  it("logs out from the profile menu and returns to welcome auth", async () => {
    const user = userEvent.setup();

    renderWithStore(<App />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await screen.findByRole("heading", { name: "Home" });

    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    await user.click(screen.getByRole("menuitem", { name: /Log out/i }));

    expect(clearCognitoTokens).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Teacher Wang", { selector: ".welcome-auth-brand-mark" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("returns to welcome auth when an API call receives 401", async () => {
    const user = userEvent.setup();

    renderWithStore(<App />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await screen.findByRole("heading", { name: "Home" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      }),
    );

    const { apiFetch } = await import("./utils/auth/apiFetch");
    await apiFetch("/api/characters", { method: "GET" });

    await waitFor(() => {
      expect(clearCognitoTokens).toHaveBeenCalled();
      expect(
        screen.getByText("Teacher Wang", {
          selector: ".welcome-auth-brand-mark",
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("refreshes the store from the profile Synchro action", async () => {
    const user = userEvent.setup();

    renderWithStore(<App />);

    await user.type(screen.getByLabelText("Username"), "learner");
    await user.type(screen.getByLabelText("Password"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await screen.findByRole("heading", { name: "Home" });

    const fetchMock = vi.mocked(fetch);
    const callsBeforeSync = fetchMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Profile menu" }));
    await user.click(screen.getByRole("menuitem", { name: /Synchro/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeSync);
    });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/characters"))).toBe(true);
    expect(urls.some((url) => url.includes("/words"))).toBe(true);
    expect(urls.some((url) => url.includes("/hsk-level"))).toBe(true);
  });
});
