import { render, screen, waitFor, within } from "@testing-library/react";
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

        if (url.endsWith("/anki/status") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              connected: false,
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
    expect(
      screen.getByText((_, element) => {
        const normalized =
          element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return (
          normalized === "1,250 (roughly 0.000435$)" &&
          element?.classList.contains("preferences-token-total-value") === true
        );
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Token usage for the last 7 days" }),
    ).toBeInTheDocument();
  });

  it("shows Anki synchronization with disconnected warning", async () => {
    render(<PreferencesPage />);

    expect(
      await screen.findByRole("heading", { name: "Anki synchronization" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Start the Anki app with the AnkiConnect add-on activated/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Mandarin vocabulary")).toBeInTheDocument();
    expect(screen.getByText("Mandarin writting")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured")).toHaveLength(2);

    const setupButtons = screen.getAllByRole("button", { name: "Setup" });
    expect(setupButtons).toHaveLength(2);
    expect(setupButtons[0]).toBeDisabled();
    expect(setupButtons[1]).toBeDisabled();
  });

  it("opens the AnkiConnect guide from the info button", async () => {
    const user = userEvent.setup();
    render(<PreferencesPage />);

    await screen.findByRole("heading", { name: "Anki synchronization" });
    await user.click(
      screen.getByRole("button", { name: "How to set up AnkiConnect" }),
    );

    expect(
      screen.getByRole("heading", { name: "Set up AnkiConnect" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Create an Anki account")).toBeInTheDocument();
    expect(screen.getByText("Install Anki desktop")).toBeInTheDocument();
    expect(screen.getByText(/2055492159/)).toBeInTheDocument();
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

  it("allows deck setup with field mapping when AnkiConnect is connected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/llm-config") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              LLM_API_KEY: "key",
              LLM_MODEL: "gpt-4o-mini",
            }),
          });
        }

        if (url.endsWith("/token-usage") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              total_tokens: 0,
              total_cost_usd: 0,
              days: [
                { date: "2026-07-18", tokens: 0 },
                { date: "2026-07-19", tokens: 0 },
                { date: "2026-07-20", tokens: 0 },
                { date: "2026-07-21", tokens: 0 },
                { date: "2026-07-22", tokens: 0 },
                { date: "2026-07-23", tokens: 0 },
                { date: "2026-07-24", tokens: 0 },
              ],
            }),
          });
        }

        if (url.endsWith("/anki/status") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              connected: true,
              decks: {
                mandarin_writting: {
                  status: "not_synchronized",
                  deck_name: "Characters",
                  model_name: "Basic",
                  fields: { recto: "Front", verso: "Back" },
                },
                mandarin_vocabulary: {
                  status: "not_configured",
                  deck_name: "",
                  model_name: "",
                  fields: {},
                },
              },
            }),
          });
        }

        if (url.endsWith("/anki/decks") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ decks: ["Default", "Words"] }),
          });
        }

        if (url.endsWith("/anki/models") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ models: ["Words"] }),
          });
        }

        if (url.includes("/anki/models/") && url.endsWith("/fields")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              fields: ["Hanzi", "Reading", "Meaning"],
            }),
          });
        }

        if (url.endsWith("/anki/decks/setup") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              kind: "mandarin_vocabulary",
              deck: {
                status: "not_synchronized",
                deck_name: "Words",
                model_name: "Words",
                fields: {
                  writting: "Hanzi",
                  pinyin: "Reading",
                  definition: "Meaning",
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

    render(<PreferencesPage />);
    await screen.findByRole("heading", { name: "Anki synchronization" });

    expect(screen.queryByText(/Start the Anki app/)).not.toBeInTheDocument();
    expect(screen.getByText("Not synchronized")).toBeInTheDocument();
    expect(screen.getByText("Characters")).toBeInTheDocument();

    const wordsRow = screen.getByText("Mandarin vocabulary").closest("li");
    expect(wordsRow).not.toBeNull();
    await user.click(
      within(wordsRow as HTMLElement).getByRole("button", { name: "Setup" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Set up Mandarin vocabulary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The Anki note type should support 3 directions/),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Existing deck"), "Words");
    await user.selectOptions(screen.getByLabelText("Note type"), "Words");

    await screen.findByLabelText(/writting/);
    await user.selectOptions(screen.getByLabelText(/writting/), "Hanzi");
    await user.selectOptions(screen.getByLabelText(/pinyin/), "Reading");
    await user.selectOptions(screen.getByLabelText(/definition/), "Meaning");
    await user.click(screen.getByRole("button", { name: "Save mapping" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/anki/decks/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "mandarin_vocabulary",
          deck_name: "Words",
          model_name: "Words",
          fields: {
            writting: "Hanzi",
            pinyin: "Reading",
            definition: "Meaning",
          },
          create: false,
        }),
      });
    });
  });
});
