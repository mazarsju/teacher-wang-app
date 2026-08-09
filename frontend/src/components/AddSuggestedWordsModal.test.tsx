import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddSuggestedWordsModal from "./AddSuggestedWordsModal";
import { renderWithStore } from "../test/renderWithStore";

function matchesApiPath(url: string, path: string) {
  const expected = path.startsWith("/api/") ? path : `/api${path}`;
  return new URL(url, "http://localhost").pathname === expected;
}

function jsonBody(init?: RequestInit) {
  return init?.body ? JSON.parse(String(init.body)) : {};
}

function hskWord(word: string, pinyin: string, definition: string) {
  return { id: `${word}|${pinyin}`, word, pinyin, definition, level: 1, frequency: 1 };
}

const SUGGESTIONS = [
  hskWord("爱", "ai4", "love"),
  hskWord("学习", "xue2 xi2", "to study"),
];

function setupFetch(overrides: Record<string, () => Promise<unknown>> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");

      if (matchesApiPath(url.pathname, "/hsk-words/suggestions")) {
        return Promise.resolve({ ok: true, json: async () => ({ words: SUGGESTIONS }) });
      }
      if (matchesApiPath(url.pathname, "/hsk-words/ignore") && init?.method === "POST") {
        if (overrides.ignoreHskWords) {
          return overrides.ignoreHskWords();
        }
        const ignoredWords = jsonBody(init).words as string[];
        return Promise.resolve({
          ok: true,
          json: async () => ({
            words: SUGGESTIONS.filter((word) => !ignoredWords.includes(word.word)),
          }),
        });
      }
      if (url.pathname.endsWith("/characters/bulk-create") && init?.method === "POST") {
        const characters = jsonBody(init).characters as {
          char: string;
          pinyin: string;
          writing_known: boolean;
        }[];
        if (overrides.charactersBulkCreate) {
          return overrides.charactersBulkCreate();
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            characters: characters.map((entry) => ({
              ...entry,
              updated_at: "2026-01-01T00:00:00+00:00",
            })),
          }),
        });
      }
      if (url.pathname.endsWith("/words/bulk-create") && init?.method === "POST") {
        const words = jsonBody(init).words as { word: string; definition: string | null }[];
        return Promise.resolve({
          ok: true,
          json: async () => ({
            words: words.map((entry) => ({
              ...entry,
              updated_at: "2026-01-01T00:00:00+00:00",
              characters: [...entry.word],
            })),
          }),
        });
      }
      if (matchesApiPath(url.pathname, "/characters")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (matchesApiPath(url.pathname, "/words")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (matchesApiPath(url.pathname, "/hsk-level")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            current_level: null,
            next_level: 1,
            characters_to_next_level: 1,
            progress_to_next_level: 0,
            missing_characters: [],
            max_level: 7,
            completion_ratio: 0,
          }),
        });
      }
      if (matchesApiPath(url.pathname, "/hsk-characters")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (matchesApiPath(url.pathname, "/anki/status")) {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
    }),
  );
}

describe("AddSuggestedWordsModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    setupFetch();
    const { container } = renderWithStore(
      <AddSuggestedWordsModal isOpen={false} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("loads and displays suggested words with toggles off by default", async () => {
    setupFetch();
    renderWithStore(<AddSuggestedWordsModal isOpen onClose={() => {}} />);

    expect(await screen.findByText("爱")).toBeInTheDocument();
    expect(screen.getByText("学习")).toBeInTheDocument();
    expect(screen.getByText("love")).toBeInTheDocument();

    const toggles = screen.getAllByRole("switch");
    expect(toggles).toHaveLength(2);
    for (const toggle of toggles) {
      expect(toggle).not.toBeChecked();
    }
  });

  it("keeps confirm disabled until a word is selected, then submits selected words and their new characters", async () => {
    setupFetch();
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithStore(<AddSuggestedWordsModal isOpen onClose={onClose} />, {
      preloadedState: {
        characters: {
          items: [
            {
              char: "学",
              pinyin: "xue2",
              writing_known: true,
              updated_at: "2026-01-01T00:00:00+00:00",
            },
          ],
        },
      },
    });

    await screen.findByText("爱");
    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toBeDisabled();

    const toggles = screen.getAllByRole("switch");
    await user.click(toggles[0]);
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const charactersCall = fetchMock.mock.calls.find(([input]: [RequestInfo]) =>
      String(input).endsWith("/characters/bulk-create"),
    );
    expect(jsonBody(charactersCall?.[1]).characters).toEqual([
      { char: "爱", pinyin: "ai4", writing_known: false },
    ]);

    const wordsCall = fetchMock.mock.calls.find(([input]: [RequestInfo]) =>
      String(input).endsWith("/words/bulk-create"),
    );
    expect(jsonBody(wordsCall?.[1]).words).toEqual([
      { word: "爱", definition: "love" },
    ]);
  });

  it("ignoring a word removes it from the list and deselects it", async () => {
    setupFetch();
    const user = userEvent.setup();

    renderWithStore(<AddSuggestedWordsModal isOpen onClose={() => {}} />);

    await screen.findByText("爱");
    const toggles = screen.getAllByRole("switch");
    await user.click(toggles[0]);

    const ignoreButtons = screen.getAllByRole("button", { name: "Ignore" });
    await user.click(ignoreButtons[0]);

    await waitFor(() => expect(screen.queryByText("爱")).not.toBeInTheDocument());
    expect(screen.getByText("学习")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const ignoreCall = fetchMock.mock.calls.find(([input]: [RequestInfo]) =>
      String(input).endsWith("/hsk-words/ignore"),
    );
    expect(jsonBody(ignoreCall?.[1])).toEqual({ words: ["爱"] });
  });

  it("shows an error message when ignoring a word fails", async () => {
    setupFetch({
      ignoreHskWords: async () => ({ ok: false, json: async () => ({}) }),
    });
    const user = userEvent.setup();

    renderWithStore(<AddSuggestedWordsModal isOpen onClose={() => {}} />);

    await screen.findByText("爱");
    const ignoreButtons = screen.getAllByRole("button", { name: "Ignore" });
    await user.click(ignoreButtons[0]);

    expect(await screen.findByText("Failed to ignore the word(s).")).toBeInTheDocument();
    expect(screen.getByText("爱")).toBeInTheDocument();
  });

  it("ignoring all words sends every displayed word and empties the list", async () => {
    setupFetch();
    const user = userEvent.setup();

    renderWithStore(<AddSuggestedWordsModal isOpen onClose={() => {}} />);

    await screen.findByText("爱");
    await user.click(screen.getByRole("button", { name: "Ignore all words" }));

    await waitFor(() =>
      expect(
        screen.getByText("No more words to suggest right now."),
      ).toBeInTheDocument(),
    );

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const ignoreCall = fetchMock.mock.calls.find(([input]: [RequestInfo]) =>
      String(input).endsWith("/hsk-words/ignore"),
    );
    expect(jsonBody(ignoreCall?.[1])).toEqual({ words: ["爱", "学习"] });
    expect(screen.queryByRole("button", { name: "Ignore all words" })).not.toBeInTheDocument();
  });
});
