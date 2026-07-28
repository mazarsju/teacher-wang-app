import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBasePage from "./KnowledgeBasePage";

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
    updated_at: "2026-07-12T12:00:00+00:00",
    characters: ["爱", "好"],
  },
];

function matchesApiPath(url: string, path: string) {
  try {
    return new URL(url, "http://localhost").pathname === path;
  } catch {
    return url === path || url.startsWith(`${path}?`);
  }
}

async function enterViewMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "View" }));
}

describe("KnowledgeBasePage", () => {
  beforeEach(() => {
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

        if (matchesApiPath(url, "/anki/status")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
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

  it("starts in edit mode with words before characters", async () => {
    render(<KnowledgeBasePage />);

    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Search words...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search characters...")).toBeInTheDocument();

    const wordsHeading = screen.getByRole("heading", { name: "Words" });
    const charactersHeading = screen.getByRole("heading", { name: "Characters" });
    expect(
      wordsHeading.compareDocumentPosition(charactersHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("switches between edit and view modes", async () => {
    const user = userEvent.setup();

    render(<KnowledgeBasePage />);

    expect(await screen.findByPlaceholderText("Search characters...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();

    await enterViewMode(user);

    expect(screen.queryByPlaceholderText("Search characters...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modify" })).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "ai" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Modify" }));

    expect(await screen.findByPlaceholderText("Search characters...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });

  it("loads a preview first then refreshes with the full knowledge base", async () => {
    const fetchMock = vi.mocked(fetch);
    const previewCharacters = characters.slice(0, 1);
    const previewWords = words.slice(0, 1);

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (matchesApiPath(url, "/characters")) {
        const limited = url.includes("limit=10");
        return Promise.resolve({
          ok: true,
          json: async () => (limited ? previewCharacters : characters),
        });
      }

      if (matchesApiPath(url, "/words")) {
        const limited = url.includes("limit=10");
        return Promise.resolve({
          ok: true,
          json: async () => (limited ? previewWords : words),
        });
      }

      if (matchesApiPath(url, "/anki/status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
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
          }),
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({}),
      });
    });

    render(<KnowledgeBasePage />);

    expect(await screen.findByRole("cell", { name: "爱" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "好" })).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "爱好" })).toBeInTheDocument();
    });

    const characterCalls = fetchMock.mock.calls.filter((call) =>
      matchesApiPath(String(call[0]), "/characters"),
    );
    const wordCalls = fetchMock.mock.calls.filter((call) =>
      matchesApiPath(String(call[0]), "/words"),
    );
    expect(characterCalls.some((call) => String(call[0]).includes("limit=10"))).toBe(
      true,
    );
    expect(wordCalls.some((call) => String(call[0]).includes("limit=10"))).toBe(true);
    expect(characterCalls.some((call) => !String(call[0]).includes("?"))).toBe(true);
    expect(wordCalls.some((call) => !String(call[0]).includes("?"))).toBe(true);
  });

  it("loads and displays characters and words in edit mode", async () => {
    render(<KnowledgeBasePage />);

    expect(await screen.findByRole("cell", { name: "爱" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "唉" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "好" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "ai4" })).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "爱好" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "hobby" })).toBeInTheDocument();
  });

  it("filters characters by search query", async () => {
    const user = userEvent.setup();

    render(<KnowledgeBasePage />);
    await screen.findByRole("cell", { name: "爱" });

    await user.type(screen.getByPlaceholderText("Search characters..."), "zz");

    await waitFor(() => {
      expect(screen.queryByRole("cell", { name: "爱" })).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("No characters match your search."),
    ).toBeInTheDocument();
  });

  it("filters words by search query", async () => {
    const user = userEvent.setup();

    render(<KnowledgeBasePage />);
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

    render(<KnowledgeBasePage />);
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

    render(<KnowledgeBasePage />);
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

    render(<KnowledgeBasePage />);
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
    const fetchMock = vi.mocked(fetch);
    let pendingEstimate = 2;

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

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

      if (matchesApiPath(url, "/anki/status") && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
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
          }),
        });
      }

      if (url.endsWith("/anki/sync/quick") && method === "POST") {
        pendingEstimate = 0;
        return Promise.resolve({
          ok: true,
          json: async () => ({
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
          }),
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({}),
      });
    });

    render(<KnowledgeBasePage />);

    expect(
      await screen.findByText(
        "2 cards need to be added in Anki for synchronization.",
      ),
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

    render(<KnowledgeBasePage />);
    await screen.findByRole("button", { name: "Export" });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/database/export")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            message: "Database exported to db.txt",
            filename: "db.txt",
          }),
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
        screen.getByText('The database has been saved in the "db.txt" file.'),
      ).toBeInTheDocument();
    });
  });

  it("imports a database file from edit mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    render(<KnowledgeBasePage />);
    await screen.findByRole("button", { name: "Import" });

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
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

      return Promise.resolve({
        ok: false,
        json: async () => ({}),
      });
    });

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
