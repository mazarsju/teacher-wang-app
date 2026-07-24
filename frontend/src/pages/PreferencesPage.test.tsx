import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreferencesPage from "./PreferencesPage";

describe("PreferencesPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/llm-config") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              LLM_API_KEY: "existing-key",
              LLM_MODEL: "gpt-4o-mini",
            }),
          });
        }

        if (url.endsWith("/token-usage") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              total_tokens: 1250,
              total_cost_usd: 0.000435,
              days: [
                { date: "2026-07-18", tokens: 10 },
                { date: "2026-07-19", tokens: 20 },
                { date: "2026-07-20", tokens: 0 },
                { date: "2026-07-21", tokens: 100 },
                { date: "2026-07-22", tokens: 50 },
                { date: "2026-07-23", tokens: 70 },
                { date: "2026-07-24", tokens: 1000 },
              ],
            }),
          });
        }

        if (url.endsWith("/llm-config") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              LLM_API_KEY: "new-key",
              LLM_MODEL: "gpt-4o",
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and displays the LLM configuration fields", async () => {
    render(<PreferencesPage />);

    expect(
      screen.getByRole("heading", { name: "Preferences" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "LLM configuration" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("LLM API key")).toHaveValue("existing-key");
    expect(screen.getByLabelText("LLM model")).toHaveValue("gpt-4o-mini");
  });

  it("shows total token usage and the 7-day chart", async () => {
    render(<PreferencesPage />);

    expect(
      await screen.findByRole("heading", { name: "Token usage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total tokens used")).toBeInTheDocument();
    expect(screen.getByText("1,250 (roughly 0.000435$)")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Token usage for the last 7 days" }),
    ).toBeInTheDocument();
  });

  it("saves the LLM configuration through the API", async () => {
    const user = userEvent.setup();

    render(<PreferencesPage />);
    await screen.findByLabelText("LLM API key");

    await user.clear(screen.getByLabelText("LLM API key"));
    await user.type(screen.getByLabelText("LLM API key"), "new-key");
    await user.clear(screen.getByLabelText("LLM model"));
    await user.type(screen.getByLabelText("LLM model"), "gpt-4o");
    await user.click(
      screen.getByRole("button", { name: "Save LLM configuration" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("LLM configuration saved."),
      ).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith("/llm-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        LLM_API_KEY: "new-key",
        LLM_MODEL: "gpt-4o",
      }),
    });
    expect(screen.getByLabelText("LLM API key")).toHaveValue("new-key");
    expect(screen.getByLabelText("LLM model")).toHaveValue("gpt-4o");
  });
});
