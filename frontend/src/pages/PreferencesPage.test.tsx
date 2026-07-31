import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreferencesPage from "./PreferencesPage";
import * as ankiApi from "../utils/anki/ankiApi";
import type { AnkiStatus } from "../types/anki";
import { renderWithStore } from "../test/renderWithStore";

vi.mock("../utils/anki/ankiApi", () => ({
  fetchAnkiStatus: vi.fn(),
  fetchAnkiDecks: vi.fn(),
  fetchAnkiModels: vi.fn(),
  fetchAnkiModelFields: vi.fn(),
  setupAnkiDeck: vi.fn(),
  autoSetupVocabularyDeck: vi.fn(),
  fetchAnkiPendingSync: vi.fn(),
  runAnkiSync: vi.fn(),
  runAnkiQuickSync: vi.fn(),
}));

const fetchAnkiStatus = vi.mocked(ankiApi.fetchAnkiStatus);
const fetchAnkiDecks = vi.mocked(ankiApi.fetchAnkiDecks);
const fetchAnkiModels = vi.mocked(ankiApi.fetchAnkiModels);
const fetchAnkiModelFields = vi.mocked(ankiApi.fetchAnkiModelFields);
const setupAnkiDeck = vi.mocked(ankiApi.setupAnkiDeck);

const disconnectedStatus: AnkiStatus = {
  connected: false,
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
};

const syncedSettingsState = {
  settings: {
    llmConfig: {
      LLM_API_KEY: "existing-key",
      LLM_MODEL: "gpt-4o-mini",
    },
  },
  anki: { status: disconnectedStatus },
  sync: {
    status: "succeeded" as const,
    error: null,
    lastSyncedAt: "2026-07-31T00:00:00.000Z",
  },
};

describe("PreferencesPage", () => {
  beforeEach(() => {
    fetchAnkiStatus.mockResolvedValue(disconnectedStatus);
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
    vi.clearAllMocks();
  });

  it("loads and displays the LLM configuration fields", async () => {
    renderWithStore(<PreferencesPage />, { preloadedState: syncedSettingsState });

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
    renderWithStore(<PreferencesPage />, { preloadedState: syncedSettingsState });

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
    renderWithStore(<PreferencesPage />, { preloadedState: syncedSettingsState });

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
    expect(
      screen.queryByRole("button", { name: "Sync" }),
    ).not.toBeInTheDocument();
  });

  it("opens the AnkiConnect guide from the info button", async () => {
    const user = userEvent.setup();
    renderWithStore(<PreferencesPage />, { preloadedState: syncedSettingsState });

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
    expect(screen.getByText(/webCorsOriginList/)).toBeInTheDocument();
  });

  it("saves the LLM configuration through the API", async () => {
    const user = userEvent.setup();

    renderWithStore(<PreferencesPage />, { preloadedState: syncedSettingsState });
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

    expect(fetch).toHaveBeenCalledWith(
      "/api/llm-config",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          LLM_API_KEY: "new-key",
          LLM_MODEL: "gpt-4o",
        }),
      }),
    );
    expect(screen.getByLabelText("LLM API key")).toHaveValue("new-key");
    expect(screen.getByLabelText("LLM model")).toHaveValue("gpt-4o");
  });

  it("allows deck setup with field mapping when AnkiConnect is connected", async () => {
    const user = userEvent.setup();
    fetchAnkiStatus.mockResolvedValue({
      connected: true,
      synchronization_status: "not_synchronized",
      pending_push_estimate: 0,
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
    });
    fetchAnkiDecks.mockResolvedValue(["Default", "Characters", "Words"]);
    fetchAnkiModels.mockResolvedValue(["Basic", "Words"]);
    fetchAnkiModelFields.mockImplementation(async (modelName: string) =>
      modelName === "Basic"
        ? ["Front", "Back"]
        : ["Hanzi", "Reading", "Meaning"],
    );
    setupAnkiDeck.mockResolvedValue({
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
    });

    renderWithStore(<PreferencesPage />, {
      preloadedState: {
        ...syncedSettingsState,
        anki: {
          status: {
            connected: true,
            synchronization_status: "not_synchronized",
            pending_push_estimate: 0,
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
          },
        },
      },
    });
    await screen.findByRole("heading", { name: "Anki synchronization" });

    expect(screen.queryByText(/Start the Anki app/)).not.toBeInTheDocument();
    expect(screen.getByText("Not synchronized")).toBeInTheDocument();
    expect(screen.getByText("Characters")).toBeInTheDocument();

    const writingRow = screen.getByText("Mandarin writting").closest("li");
    expect(writingRow).not.toBeNull();
    expect(
      within(writingRow as HTMLElement).getByRole("button", {
        name: "Sync",
      }),
    ).toBeInTheDocument();

    const wordsRow = screen.getByText("Mandarin vocabulary").closest("li");
    expect(wordsRow).not.toBeNull();
    expect(
      within(wordsRow as HTMLElement).queryByRole("button", {
        name: "Sync",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(writingRow as HTMLElement).getByRole("button", { name: "Setup" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Set up Mandarin writting" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Existing deck")).toHaveValue("Characters");
    expect(screen.getByLabelText("Deck type")).toHaveValue("Basic");

    await screen.findByLabelText(/recto/);
    expect(screen.getByLabelText(/recto/)).toHaveValue("Front");
    expect(screen.getByLabelText(/verso/)).toHaveValue("Back");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(
      within(wordsRow as HTMLElement).getByRole("button", { name: "Setup" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Set up Mandarin vocabulary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This deck is the main deck for practicing vocabulary/),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Existing deck"), "Words");
    await user.selectOptions(screen.getByLabelText("Deck type"), "Words");

    await screen.findByLabelText(/writting/);
    await user.selectOptions(screen.getByLabelText(/writting/), "Hanzi");
    await user.selectOptions(screen.getByLabelText(/pinyin/), "Reading");
    await user.selectOptions(screen.getByLabelText(/definition/), "Meaning");
    await user.click(screen.getByRole("button", { name: "Save mapping" }));

    await waitFor(() => {
      expect(setupAnkiDeck).toHaveBeenCalledWith({
        kind: "mandarin_vocabulary",
        deckName: "Words",
        modelName: "Words",
        fields: {
          writting: "Hanzi",
          pinyin: "Reading",
          definition: "Meaning",
        },
        create: false,
      });
    });
  });
});
