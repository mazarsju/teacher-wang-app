import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBasePage from "./KnowledgeBasePage";
import * as ankiApi from "../utils/anki/ankiApi";
import type { AnkiStatus } from "../types/anki";
import { renderWithStore } from "../test/renderWithStore";

vi.mock("../utils/anki/ankiApi", () => ({
  fetchAnkiStatus: vi.fn(),
  runAnkiQuickSync: vi.fn(),
}));

const fetchAnkiStatus = vi.mocked(ankiApi.fetchAnkiStatus);
const runAnkiQuickSync = vi.mocked(ankiApi.runAnkiQuickSync);

const defaultAnkiStatus: AnkiStatus = {
  connected: true,
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

const characters = [
  {
    char: "爱",
    pinyin: "ai4",
    writting_known: true,
    updated_at: "2026-07-12T12:00:00+00:00",
  },
  {
    char: "唉",
    pinyin: "ai4",
    writting_known: false,
    updated_at: "2026-07-12T12:00:00+00:00",
  },
  {
    char: "好",
    pinyin: "hao3",
    writting_known: true,
    updated_at: "2026-07-12T12:00:00+00:00",
  },
];

const words = [
  {
    word: "爱好",
    definition: "hobby",
    pinyin: "ai4 hao3",
    writting_known: false,
    updated_at: "2026-07-12T12:00:00+00:00",
    characters: ["爱", "好"],
  },
];

const syncedState = {
  characters: { items: characters },
  words: { items: words },
  hsk: {
    status: {
      current_level: null,
      next_level: 1,
      characters_to_next_level: 1,
      progress_to_next_level: 0,
      missing_characters: [],
      max_level: 7,
      completion_ratio: 0.85,
    },
  },
  anki: { status: defaultAnkiStatus },
  sync: {
    status: "succeeded" as const,
    error: null,
    lastSyncedAt: "2026-07-31T00:00:00.000Z",
  },
};

function matchesApiPath(url: string, path: string) {
  const expected = path.startsWith("/api/") ? path : `/api${path}`;
  try {
    return new URL(url, "http://localhost").pathname === expected;
  } catch {
    return url === expected || url.startsWith(`${expected}?`);
  }
}

async function enterViewMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "View" }));
}

describe("KnowledgeBasePage", () => {
  beforeEach(() => {
    fetchAnkiStatus.mockResolvedValue(defaultAnkiStatus);
    runAnkiQuickSync.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);

        if (matchesApiPath(url, "/characters")) {
          return Promise.resolve({
            ok: true,
            json: async () => characters,
          });
        }

        if (matchesApiPath(url, "/words")) {
          return Promise.resolve({
            ok: true,
            json: async () => words,
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

  it("starts in edit mode with words before characters", async () => {
    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });

    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText("Search words..."),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search characters..."),
    ).toBeInTheDocument();

    const wordsHeading = screen.getByRole("heading", { name: "Words" });
    const charactersHeading = screen.getByRole("heading", {
      name: "Characters",
    });
    expect(
      wordsHeading.compareDocumentPosition(charactersHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the onboarding banner and opens the init wizard when few words are known", async () => {
    const user = userEvent.setup();
    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });

    await user.click(
      screen.getByRole("button", { name: "Start building your knowledge base" }),
    );

    expect(
      screen.getByRole("heading", { name: "Build your knowledge base" }),
    ).toBeInTheDocument();
  });

  it("hides the onboarding banner once enough words are known", () => {
    const manyWords = Array.from({ length: 10 }, (_, index) => ({
      word: `word-${index}`,
      definition: null,
      pinyin: null,
      writting_known: false,
      updated_at: "2026-07-12T12:00:00+00:00",
      characters: [] as string[],
    }));

    renderWithStore(<KnowledgeBasePage />, {
      preloadedState: { ...syncedState, words: { items: manyWords } },
    });

    expect(
      screen.queryByRole("button", { name: "Start building your knowledge base" }),
    ).not.toBeInTheDocument();
  });

  it("switches between edit and view modes", async () => {
    const user = userEvent.setup();

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });

    expect(
      await screen.findByPlaceholderText("Search characters..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();

    await enterViewMode(user);

    expect(
      screen.queryByPlaceholderText("Search characters..."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modify" })).toBeInTheDocument();
    expect(
      await screen.findByRole("columnheader", { name: "ai" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Modify" }));

    expect(
      await screen.findByPlaceholderText("Search characters..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });

  it("loads and displays characters and words in edit mode", async () => {
    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });

    expect(await screen.findByRole("cell", { name: "爱" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "唉" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "好" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "ai4" })).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "爱好" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "hobby" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "ai4 hao3" })).toBeInTheDocument();
  });

  it("auto-fills pinyin from the user's own character table when missing from HSK", async () => {
    const user = userEvent.setup();

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await screen.findByRole("button", { name: "Add word" });

    await user.click(screen.getByRole("button", { name: "Add word" }));
    // "好" is only known via the user's own `characters` table (no HSK
    // reading seeded in this test); "你" is unknown everywhere.
    await user.type(screen.getByLabelText("words"), "你好");

    expect(screen.getByLabelText("pinyin")).toHaveValue("?? hao3");
  });

  it("keeps the characters section read-only: no add/edit/delete controls", async () => {
    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await screen.findByRole("cell", { name: "爱" });

    expect(
      screen.queryByRole("button", { name: "Add character" }),
    ).not.toBeInTheDocument();

    const charactersSection = screen
      .getByRole("heading", { name: "Characters" })
      .closest("section") as HTMLElement;
    expect(
      within(charactersSection).queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      within(charactersSection).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();

    // The words section keeps its own edit/delete controls.
    const wordsSection = screen
      .getByRole("heading", { name: "Words" })
      .closest("section") as HTMLElement;
    expect(
      within(wordsSection).getByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      within(wordsSection).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("auto-creates only the missing characters when adding a word", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await screen.findByRole("button", { name: "Add word" });

    let bulkCreateCharactersBody: unknown = null;

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/characters/bulk-create") && init?.method === "POST") {
          bulkCreateCharactersBody = JSON.parse(String(init.body));
          const body = bulkCreateCharactersBody as {
            characters: { char: string; pinyin: string; writting_known: boolean }[];
          };
          return Promise.resolve({
            ok: true,
            json: async () => ({
              characters: body.characters.map((entry) => ({
                ...entry,
                updated_at: "2026-08-08T00:00:00+00:00",
              })),
            }),
          });
        }

        if (url.endsWith("/words") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as {
            word: string;
            definition: string | null;
            pinyin: string | null;
          };
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ...body,
              updated_at: "2026-08-08T00:00:00+00:00",
              characters: [...body.word],
            }),
          });
        }

        if (matchesApiPath(url, "/characters")) {
          return Promise.resolve({ ok: true, json: async () => characters });
        }
        if (matchesApiPath(url, "/words")) {
          return Promise.resolve({ ok: true, json: async () => words });
        }

        return Promise.resolve({ ok: false, json: async () => ({}) });
      },
    );

    await user.click(screen.getByRole("button", { name: "Add word" }));
    // "好" already exists in `characters`; only "你" should be auto-created.
    await user.type(screen.getByLabelText("words"), "你好");
    await user.clear(screen.getByLabelText("pinyin"));
    await user.type(screen.getByLabelText("pinyin"), "ni3 hao3");
    await user.type(screen.getByLabelText("definition"), "hello");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "你好" })).toBeInTheDocument();
    });

    expect(bulkCreateCharactersBody).toEqual({
      characters: [{ char: "你", pinyin: "ni3", writting_known: false }],
    });
  });

  it("filters characters by search query", async () => {
    const user = userEvent.setup();

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await screen.findByRole("cell", { name: "爱" });

    await user.type(screen.getByPlaceholderText("Search characters..."), "zz");

    await waitFor(() => {
      expect(
        screen.queryByRole("cell", { name: "爱" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("No characters match your search."),
    ).toBeInTheDocument();
  });

  it("filters words by search query", async () => {
    const user = userEvent.setup();

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await screen.findByRole("cell", { name: "爱好" });

    await user.type(screen.getByPlaceholderText("Search words..."), "zz");

    await waitFor(() => {
      expect(
        screen.queryByRole("cell", { name: "爱好" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("No words match your search.")).toBeInTheDocument();
  });

  it("shows view mode toggles for writing known and not known", async () => {
    const user = userEvent.setup();

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await enterViewMode(user);

    expect(
      await screen.findByRole("switch", { name: "Writting known" }),
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Writting not known" }),
    ).toBeChecked();
  });

  it("hides characters based on the view mode toggles", async () => {
    const user = userEvent.setup();

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await enterViewMode(user);

    expect(
      await screen.findByRole("button", { name: "爱 associated words" }),
    ).toBeInTheDocument();
    expect(screen.getByText("唉")).toBeInTheDocument();
    expect(screen.getByText("好")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Writting known" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "爱 associated words" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("好")).not.toBeInTheDocument();
    });
    expect(screen.getByText("唉")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Writting known" }));
    await user.click(
      screen.getByRole("switch", { name: "Writting not known" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("唉")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "爱 associated words" }),
    ).toBeInTheDocument();
    expect(screen.getByText("好")).toBeInTheDocument();
  });

  it("opens the associated words modal when clicking a linked character", async () => {
    const user = userEvent.setup();

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await enterViewMode(user);

    await user.click(
      await screen.findByRole("button", { name: "爱 associated words" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Associated words:")).toBeInTheDocument();
    expect(screen.getByText("爱好 (hobby)")).toBeInTheDocument();
  });

  it("shows a quick synchro banner after overall Anki sync when cards are pending", async () => {
    const user = userEvent.setup();
    let pendingEstimate = 2;

    fetchAnkiStatus.mockImplementation(async () => ({
      connected: true,
      synchronization_status: "synchronized",
      pending_push_estimate: pendingEstimate,
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
          status: "synchronized",
          deck_name: "Writting",
          model_name: "Basic",
          fields: { recto: "Front", verso: "Back" },
        },
      },
    }));

    runAnkiQuickSync.mockImplementation(async () => {
      pendingEstimate = 0;
      return {
        mandarin_vocabulary: {
          kind: "mandarin_vocabulary",
          action: "synchronize_all",
          added: 1,
          ignored: 0,
          failed: 0,
          deck: {
            status: "synchronized",
            deck_name: "Vocab",
            model_name: "Vocab",
            fields: {},
          },
        },
        mandarin_writting: {
          kind: "mandarin_writting",
          action: "synchronize_all",
          added: 1,
          ignored: 0,
          failed: 0,
          deck: {
            status: "synchronized",
            deck_name: "Writting",
            model_name: "Basic",
            fields: {},
          },
        },
        synchronization_status: "synchronized",
        pending_push_estimate: 0,
      };
    });

    renderWithStore(<KnowledgeBasePage />, {
      preloadedState: {
        ...syncedState,
        anki: {
          status: {
            connected: true,
            synchronization_status: "synchronized",
            pending_push_estimate: 2,
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
                status: "synchronized",
                deck_name: "Writting",
                model_name: "Basic",
                fields: { recto: "Front", verso: "Back" },
              },
            },
          },
        },
      },
    });

    expect(
      screen.getByText("2 cards need to be added in Anki for synchronization."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quick synchro" }));

    await waitFor(() => {
      expect(
        screen.queryByText(
          "2 cards need to be added in Anki for synchronization.",
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("exports the database from edit mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await screen.findByRole("button", { name: "Export" });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/database/export")) {
        const blob = new Blob(["test"], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "teacher-wang-export.zip";
        a.click();
        URL.revokeObjectURL(url);
        return Promise.resolve({
          ok: true,
          blob: async () => blob,
        });
      }

      if (matchesApiPath(url, "/characters")) {
        return Promise.resolve({
          ok: true,
          json: async () => characters,
        });
      }

      if (matchesApiPath(url, "/words")) {
        return Promise.resolve({
          ok: true,
          json: async () => words,
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({}),
      });
    });

    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => {
      expect(
        screen.getByText("The database has been downloaded as a zip file."),
      ).toBeInTheDocument();
    });
  });

  it("imports a database file from edit mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    renderWithStore(<KnowledgeBasePage />, { preloadedState: syncedState });
    await screen.findByRole("button", { name: "Import" });

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/characters/bulk") && init?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: "File received" }),
          });
        }

        if (matchesApiPath(url, "/characters")) {
          return Promise.resolve({
            ok: true,
            json: async () => characters,
          });
        }

        if (matchesApiPath(url, "/words")) {
          return Promise.resolve({
            ok: true,
            json: async () => words,
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

        if (matchesApiPath(url, "/hsk-characters")) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
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
      },
    );

    const fileInput = document.querySelector(
      ".knowledge-base-import-input",
    ) as HTMLInputElement;
    const file = new File(["好;hao;3;true;"], "db.txt", { type: "text/plain" });

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(
        screen.getByText("The database has been imported successfully."),
      ).toBeInTheDocument();
    });
  });
});
