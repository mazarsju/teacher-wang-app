import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PreferencesPage from "./PreferencesPage";
import * as ankiApi from "../utils/anki/ankiApi";
import * as charactersApi from "../utils/knowledgeBase/charactersApi";
import * as hskLevelApi from "../utils/knowledgeBase/hskLevelApi";
import * as wordsApi from "../utils/knowledgeBase/wordsApi";
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

vi.mock("../utils/knowledgeBase/charactersApi", () => ({
  fetchCharacters: vi.fn(),
}));

vi.mock("../utils/knowledgeBase/wordsApi", () => ({
  fetchWords: vi.fn(),
}));

vi.mock("../utils/knowledgeBase/hskLevelApi", () => ({
  fetchHskLevelStatus: vi.fn(),
}));

const fetchAnkiStatus = vi.mocked(ankiApi.fetchAnkiStatus);
const fetchAnkiDecks = vi.mocked(ankiApi.fetchAnkiDecks);
const fetchAnkiModels = vi.mocked(ankiApi.fetchAnkiModels);
const fetchAnkiModelFields = vi.mocked(ankiApi.fetchAnkiModelFields);
const setupAnkiDeck = vi.mocked(ankiApi.setupAnkiDeck);
const fetchAnkiPendingSync = vi.mocked(ankiApi.fetchAnkiPendingSync);
const runAnkiSync = vi.mocked(ankiApi.runAnkiSync);
const fetchCharacters = vi.mocked(charactersApi.fetchCharacters);
const fetchWords = vi.mocked(wordsApi.fetchWords);
const fetchHskLevelStatus = vi.mocked(hskLevelApi.fetchHskLevelStatus);

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

const syncedState = {
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
    fetchCharacters.mockResolvedValue([]);
    fetchWords.mockResolvedValue([]);
    fetchHskLevelStatus.mockResolvedValue({
      level: 1,
      known_characters: 0,
      total_characters: 300,
      remaining_characters: 300,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);

        if (url.endsWith("/token-usage")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              total_tokens: 1250,
              total_cost_usd: 0.000435,
              plan: "free",
              available_token: 98750,
              max_allowed_token: 100000,
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

  it("shows total token usage, remaining tokens bar, and the 7-day chart", async () => {
    renderWithStore(<PreferencesPage />, { preloadedState: syncedState });

    expect(
      screen.getByRole("heading", { name: "Preferences" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Token usage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total tokens used")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        return (
          element?.textContent?.trim() === "1,250" &&
          element?.classList.contains("preferences-token-total-value") === true
        );
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/roughly/i)).not.toBeInTheDocument();
    expect(screen.getByText("Remaining tokens")).toBeInTheDocument();
    expect(screen.getByText("98,750 / 100,000")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Remaining free-plan tokens" }),
    ).toHaveAttribute("aria-valuenow", "98750");
    expect(
      screen.getByRole("img", { name: "Token usage for the last 7 days" }),
    ).toBeInTheDocument();
  });

  it("shows Anki synchronization with disconnected warning", async () => {
    renderWithStore(<PreferencesPage />, { preloadedState: syncedState });

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
    renderWithStore(<PreferencesPage />, { preloadedState: syncedState });

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

  it("does not expose LLM configuration controls", async () => {
    renderWithStore(<PreferencesPage />, { preloadedState: syncedState });

    await screen.findByRole("heading", { name: "Token usage" });
    expect(
      screen.queryByRole("heading", { name: "LLM configuration" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("LLM API key")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("LLM model")).not.toBeInTheDocument();
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
        ...syncedState,
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

  it("refreshes Redux app data after an Anki pull", async () => {
    const user = userEvent.setup();
    const connectedStatus: AnkiStatus = {
      connected: true,
      synchronization_status: "not_synchronized",
      pending_push_estimate: 0,
      decks: {
        mandarin_vocabulary: {
          status: "not_synchronized",
          deck_name: "Vocab",
          model_name: "Vocab",
          fields: {
            writting: "writting",
            pinyin: "pinyin",
            definition: "definition",
          },
        },
        mandarin_writting: {
          status: "not_configured",
          deck_name: "",
          model_name: "",
          fields: {},
        },
      },
    };
    fetchAnkiStatus.mockResolvedValue(connectedStatus);
    fetchAnkiPendingSync.mockResolvedValue({
      kind: "mandarin_vocabulary",
      count: 0,
      cards: [],
      unsyncable: [],
      pull_count: 1,
      pull_cards: [
        {
          id: "风",
          writting: "风",
          pinyin: "feng1",
          definition: "wind",
        },
      ],
      deck: connectedStatus.decks.mandarin_vocabulary,
    });
    runAnkiSync.mockResolvedValue({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "pull",
      added: 1,
      ignored: 0,
      failed: 0,
      deck: {
        ...connectedStatus.decks.mandarin_vocabulary,
        status: "synchronized",
      },
    });

    renderWithStore(<PreferencesPage />, {
      preloadedState: {
        ...syncedState,
        anki: { status: connectedStatus },
      },
    });

    await screen.findByRole("heading", { name: "Anki synchronization" });
    const vocabRow = screen.getByText("Mandarin vocabulary").closest("li");
    expect(vocabRow).not.toBeNull();
    await user.click(
      within(vocabRow as HTMLElement).getByRole("button", { name: "Sync" }),
    );

    await screen.findByText("1 card to pull");
    fetchCharacters.mockClear();
    fetchWords.mockClear();
    fetchHskLevelStatus.mockClear();

    await user.click(screen.getByRole("button", { name: "Pull all from Anki" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(runAnkiSync).toHaveBeenCalledWith({
        kind: "mandarin_vocabulary",
        action: "synchronize_all",
        direction: "pull",
      });
    });
    await waitFor(() => {
      expect(fetchCharacters).toHaveBeenCalled();
      expect(fetchWords).toHaveBeenCalled();
      expect(fetchHskLevelStatus).toHaveBeenCalled();
    });
  });

  it("deletes the knowledge base from dangerous actions", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    const { store } = renderWithStore(<PreferencesPage />, {
      preloadedState: {
        ...syncedState,
        characters: {
          items: [
            {
              char: "爱",
              pinyin: "ai4",
              writting_known: true,
              updated_at: "2026-07-12T12:00:00+00:00",
            },
          ],
        },
        words: {
          items: [
            {
              word: "爱好",
              definition: "hobby",
              updated_at: "2026-07-12T12:00:00+00:00",
              characters: ["爱", "好"],
            },
          ],
        },
      },
    });

    expect(
      await screen.findByRole("heading", { name: "Dangerous actions" }),
    ).toBeInTheDocument();

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/token-usage")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              total_tokens: 1250,
              total_cost_usd: 0.000435,
              plan: "free",
              available_token: 98750,
              max_allowed_token: 100000,
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

        if (
          url.includes("/database/knowledge-base") &&
          init?.method === "DELETE"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: "Knowledge base deleted" }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      },
    );

    await user.click(
      screen.getByRole("button", { name: "Delete knowledge base" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Are you sure you want to delete the knowledge base? Please make sure you have exported the database before deleting it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("This action is irreversible.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/database/knowledge-base"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(store.getState().characters.items).toEqual([]);
    expect(store.getState().words.items).toEqual([]);
  });
});
