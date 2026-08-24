import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GrammarVocabularyTab from "./GrammarVocabularyTab";
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

const WORDS = [hskWord("我", "wo3", "I; me"), hskWord("你", "ni3", "you")];

function setupFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");

      if (matchesApiPath(url.pathname, "/words") && init?.method === "POST") {
        const body = jsonBody(init);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...body,
            updated_at: "2026-01-01T00:00:00+00:00",
            characters: [...(body.word as string)],
            updated_characters: [],
            deleted_char_ids: [],
          }),
        });
      }
      if (url.pathname.endsWith("/characters/bulk-create") && init?.method === "POST") {
        const characters = jsonBody(init).characters as {
          char: string;
          pinyin: string;
          writing_known: boolean;
        }[];
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

      return Promise.resolve({ ok: false, json: async () => ({}) });
    }),
  );
}

describe("GrammarVocabularyTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a tick for words already known and an Add button for the rest", () => {
    setupFetch();
    renderWithStore(<GrammarVocabularyTab words={WORDS} />, {
      preloadedState: {
        words: {
          items: [
            {
              word: "我",
              definition: "I",
              pinyin: "wo3",
              writing_known: false,
              custom_fields: {},
              updated_at: "2026-01-01T00:00:00+00:00",
              characters: ["我"],
            },
          ],
        },
      },
    });

    const [knownRow, unknownRow] = screen.getAllByRole("row").slice(1);
    expect(
      within(knownRow).queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(within(unknownRow).getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("shows an empty message when there are no new words", () => {
    setupFetch();
    renderWithStore(<GrammarVocabularyTab words={[]} />);
    expect(screen.getByText("No new words for this lesson.")).toBeInTheDocument();
  });

  it("opens a pre-filled Add word modal and creates the word on confirm", async () => {
    setupFetch();
    const user = userEvent.setup();
    const { store } = renderWithStore(<GrammarVocabularyTab words={WORDS} />);

    await user.click(screen.getAllByRole("button", { name: "Add" })[0]);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("words")).toHaveValue("我");
    expect(screen.getByLabelText("pinyin")).toHaveValue("wo3");
    expect(screen.getByLabelText("definition")).toHaveValue("I; me");

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(
        store.getState().words.items.some((word) => word.word === "我"),
      ).toBe(true),
    );
  });
});
