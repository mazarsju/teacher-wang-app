import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "../test/renderWithStore";
import { mergeGrammarLevelData } from "../store/slices/grammarSlice";
import GrammarPage from "./GrammarPage";

type StubGrammarPoint = {
  id: string;
  hsk_level: number;
  index: number;
  title: string;
  prerequisites: string[];
  status: string;
  score?: number | null;
  usage_count?: number;
};

type StubWritingPractice = {
  id: string;
  title: string;
  after_grammar_point: string;
  context?: string | null;
  status?: string;
};

// GrammarPage no longer fetches its own list data (that's loadGrammarData,
// dispatched once at login — see store/thunks/loadGrammarData.ts); it just
// renders whatever is already in the `grammar`/`hsk` slices. So tests
// preload the store instead of stubbing a list-fetching `fetch`. A generic
// `fetch` stub is still needed for the page's own `/auth/me` (plan) request
// and for the grammar-point/writing-practice *detail* pages a row click
// opens.
function preloadedGrammarState(
  points: StubGrammarPoint[],
  writingPractices: StubWritingPractice[] = [],
  currentLevel: number = 1,
  loadedLevels?: number[],
) {
  return {
    hsk: { status: null, currentLevelLight: currentLevel },
    grammar: {
      items: points.map((point) => ({
        id: point.id,
        hsk_level: point.hsk_level,
        index: point.index,
        title: point.title,
        prerequisites: point.prerequisites,
        status: point.status,
        score: point.score ?? null,
        usage_count: point.usage_count ?? 0,
      })),
      writingPractices: writingPractices.map((practice) => ({
        id: practice.id,
        title: practice.title,
        after_grammar_point: practice.after_grammar_point,
        status: practice.status ?? "TODO",
      })),
      loaded: true,
      error: null as string | null,
      loadStatus: "succeeded" as const,
      loadedLevels: loadedLevels ?? [...new Set(points.map((point) => point.hsk_level))],
      quizInProgress: false,
    },
  };
}

function stubFetch(
  handle: (url: string) => { ok: boolean; json?: () => Promise<unknown> } | null = () => null,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const response = handle(String(input));
      return Promise.resolve(response ?? { ok: true, json: async () => ({}) });
    }),
  );
}

function stubPlanFetch(plan: string) {
  stubFetch((url) =>
    url.endsWith("/auth/me") ? { ok: true, json: async () => ({ plan }) } : null,
  );
}

function stubGrammarPoint(
  index: number,
  overrides: Partial<StubGrammarPoint> = {},
): StubGrammarPoint {
  return {
    id: `1|Lesson ${index}`,
    hsk_level: 1,
    index,
    title: `Lesson ${index}`,
    prerequisites: [],
    status: "TODO",
    ...overrides,
  };
}

describe("GrammarPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a lesson row with its number, title, and 'Not started' status", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Basic Sentence Structure",
          hsk_level: 1,
          index: 1,
          title: "Basic Sentence Structure",
          prerequisites: [],
          status: "TODO",
        },
      ]),
    });

    const row = screen.getByRole("button", { name: /Basic Sentence Structure/ });
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByText("Not started")).toBeInTheDocument();
  });

  it("shows a colored, labeled badge for SKIP, WIP, and DONE statuses", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Skipped",
          hsk_level: 1,
          index: 1,
          title: "Skipped Topic",
          prerequisites: [],
          status: "SKIP",
        },
        {
          id: "1|In Progress",
          hsk_level: 1,
          index: 2,
          title: "In Progress Topic",
          prerequisites: [],
          status: "WIP",
        },
        {
          id: "1|Finished",
          hsk_level: 1,
          index: 3,
          title: "Finished Topic",
          prerequisites: [],
          status: "DONE",
        },
      ]),
    });

    expect(screen.getByText("Skipped")).toHaveClass("grammar-status-skip");
    expect(screen.getByText("In progress")).toHaveClass("grammar-status-wip");
    expect(screen.getByText("Completed")).toHaveClass("grammar-status-done");
  });

  it("shows the saved score in the score column for a DONE lesson", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Finished",
          hsk_level: 1,
          index: 1,
          title: "Finished Topic",
          prerequisites: [],
          status: "DONE",
          score: 82,
        },
      ]),
    });

    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("shows a practice-count star next to a DONE lesson, but not for other statuses", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Finished",
          hsk_level: 1,
          index: 1,
          title: "Finished Topic",
          prerequisites: [],
          status: "DONE",
          usage_count: 2,
        },
        {
          id: "1|Todo",
          hsk_level: 1,
          index: 2,
          title: "Todo Topic",
          prerequisites: [],
          status: "TODO",
        },
        {
          id: "1|Mastered",
          hsk_level: 1,
          index: 3,
          title: "Mastered Topic",
          prerequisites: [],
          status: "MASTERED",
        },
      ]),
    });

    expect(
      screen.getByTitle(
        'You\'ve used this grammar structure in real conversation 2/3 times. Keep using it to move this lesson to "Mastered".',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /Todo Topic/ })).queryByTitle(
        /real conversation/,
      ),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /Mastered Topic/ })).queryByTitle(
        /real conversation/,
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a blue, star-labeled badge and blue score for a MASTERED lesson", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Mastered Topic",
          hsk_level: 1,
          index: 1,
          title: "Mastered Topic",
          prerequisites: [],
          status: "MASTERED",
          score: 82,
        },
      ]),
    });

    expect(screen.getByText("Mastered")).toHaveClass("grammar-status-mastered");
    expect(screen.getByText("82%")).toHaveClass("grammar-score-mastered");
  });

  it("shows grammar points whose prerequisites aren't all DONE as locked, non-clickable rows", async () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Basic Sentence Structure",
          hsk_level: 1,
          index: 1,
          title: "Basic Sentence Structure",
          prerequisites: [],
          status: "DONE",
        },
        {
          id: "1|Questions with Ma",
          hsk_level: 1,
          index: 2,
          title: "Questions with Ma",
          prerequisites: ["1|Basic Sentence Structure"],
          status: "TODO",
        },
        {
          id: "1|Negation",
          hsk_level: 1,
          index: 3,
          title: "Negation with Bu",
          prerequisites: ["1|Basic Sentence Structure", "1|Questions with Ma"],
          status: "TODO",
        },
      ]),
    });

    expect(
      screen.getByRole("button", { name: /Basic Sentence Structure/ }),
    ).toHaveAttribute("aria-disabled", "false");
    expect(
      screen.getByRole("button", { name: /Questions with Ma/ }),
    ).toHaveAttribute("aria-disabled", "false");
    // Its prerequisite ("Questions with Ma") isn't DONE/SKIP yet, so it's
    // shown but locked rather than hidden.
    const lockedRow = screen.getByRole("button", { name: /Negation with Bu/ });
    expect(lockedRow).toHaveAttribute("aria-disabled", "true");

    const user = userEvent.setup();
    await user.click(lockedRow);
    expect(screen.queryByRole("tab", { name: "Explanation" })).not.toBeInTheDocument();
  });

  it("locks lessons past the 10th of a level for the free plan", async () => {
    stubPlanFetch("free");
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([stubGrammarPoint(10), stubGrammarPoint(11)]),
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Lesson 11/ })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: /Lesson 10/ })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("does not lock lessons past the 10th of a level for the pro plan", async () => {
    stubPlanFetch("pro");
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([stubGrammarPoint(10), stubGrammarPoint(11)]),
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Lesson 11/ })).toHaveAttribute(
        "aria-disabled",
        "false",
      ),
    );
  });

  it("shows grammar points one HSK level above the learner's achieved level (the target)", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState(
        [
          {
            id: "1|Basic Sentence Structure",
            hsk_level: 1,
            index: 1,
            title: "Basic Sentence Structure",
            prerequisites: [],
            status: "TODO",
          },
          {
            id: "2|Target Level Topic",
            hsk_level: 2,
            index: 1,
            title: "Target Level Topic",
            prerequisites: [],
            status: "TODO",
          },
          {
            id: "3|Advanced Topic",
            hsk_level: 3,
            index: 1,
            title: "Advanced Topic",
            prerequisites: [],
            status: "TODO",
          },
        ],
        [],
        1,
      ),
    });

    expect(
      screen.getByRole("button", { name: /Basic Sentence Structure/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Target Level Topic/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Advanced Topic/ }),
    ).not.toBeInTheDocument();
  });

  it("treats a SKIP prerequisite as satisfied, same as DONE", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Basic Sentence Structure",
          hsk_level: 1,
          index: 1,
          title: "Basic Sentence Structure",
          prerequisites: [],
          status: "SKIP",
        },
        {
          id: "1|Questions with Ma",
          hsk_level: 1,
          index: 2,
          title: "Questions with Ma",
          prerequisites: ["1|Basic Sentence Structure"],
          status: "TODO",
        },
      ]),
    });

    expect(
      screen.getByRole("button", { name: /Questions with Ma/ }),
    ).toHaveAttribute("aria-disabled", "false");
  });

  it("shows a completion gauge per HSK level up to the target level, excluding levels above that", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState(
        [
          {
            id: "1|Done",
            hsk_level: 1,
            index: 1,
            title: "Done Topic",
            prerequisites: [],
            status: "DONE",
          },
          {
            id: "1|Todo",
            hsk_level: 1,
            index: 2,
            title: "Todo Topic",
            prerequisites: [],
            status: "TODO",
          },
          {
            id: "2|Skip",
            hsk_level: 2,
            index: 1,
            title: "Skipped Topic",
            prerequisites: [],
            status: "SKIP",
          },
          {
            id: "3|Todo",
            hsk_level: 3,
            index: 1,
            title: "Target Level Topic",
            prerequisites: [],
            status: "TODO",
          },
          {
            id: "4|Todo",
            hsk_level: 4,
            index: 1,
            title: "Above Target Level",
            prerequisites: [],
            status: "TODO",
          },
        ],
        [],
        2,
      ),
    });

    expect(screen.getByTitle("HSK 1: 50% complete")).toBeInTheDocument();
    expect(screen.getByTitle("HSK 2: 100% complete")).toBeInTheDocument();
    expect(screen.getByTitle("HSK 3: 0% complete")).toBeInTheDocument();
    expect(screen.queryByTitle(/HSK 4:/)).not.toBeInTheDocument();
  });

  it("groups lessons into a collapsible, open-by-default section per HSK level", () => {
    stubFetch();
    const { container } = renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState(
        [
          {
            id: "1|Basic Sentence Structure",
            hsk_level: 1,
            index: 1,
            title: "Basic Sentence Structure",
            prerequisites: [],
            status: "TODO",
          },
          {
            id: "2|Target Level Topic",
            hsk_level: 2,
            index: 1,
            title: "Target Level Topic",
            prerequisites: [],
            status: "TODO",
          },
        ],
        [],
        1,
      ),
    });

    const detailsElements = container.querySelectorAll("details");
    expect(detailsElements).toHaveLength(2);
    expect(screen.getByText("HSK 1 (Beginner)")).toBeInTheDocument();
    expect(screen.getByText("HSK 2 (Elementary)")).toBeInTheDocument();
    detailsElements.forEach((details) => expect(details.open).toBe(true));
    expect(
      within(detailsElements[0] as HTMLElement).getByRole("button", {
        name: /Basic Sentence Structure/,
      }),
    ).toBeInTheDocument();
    expect(
      within(detailsElements[1] as HTMLElement).getByRole("button", {
        name: /Target Level Topic/,
      }),
    ).toBeInTheDocument();
  });

  it("shows a writing topic right after the grammar lesson it follows, with a pen icon and a 'Practice:' prefix", () => {
    stubFetch();
    const { container } = renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState(
        [
          {
            id: "hsk1_existence_with_you",
            hsk_level: 1,
            index: 1,
            title: "Existence with You",
            prerequisites: [],
            status: "TODO",
          },
          {
            id: "1|Next Lesson",
            hsk_level: 1,
            index: 2,
            title: "Next Lesson",
            prerequisites: [],
            status: "TODO",
          },
        ],
        [
          {
            id: "writing-present-yourself",
            title: "Present yourself",
            after_grammar_point: "hsk1_existence_with_you",
          },
        ],
      ),
    });

    expect(screen.getByText("Practice: Present yourself")).toBeInTheDocument();
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe(
      screen.getByRole("button", { name: /Practice: Present yourself/ }),
    );
    expect(rows[2]).toBe(screen.getByRole("button", { name: /Next Lesson/ }));
  });

  it("shows the writing topic's status badge", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState(
        [
          {
            id: "hsk1_existence_with_you",
            hsk_level: 1,
            index: 1,
            title: "Existence with You",
            prerequisites: [],
            status: "TODO",
          },
        ],
        [
          {
            id: "writing-present-yourself",
            title: "Present yourself",
            after_grammar_point: "hsk1_existence_with_you",
            status: "WIP",
          },
        ],
      ),
    });

    const row = screen.getByRole("button", { name: /Practice: Present yourself/ });
    expect(within(row).getByText("In progress")).toBeInTheDocument();
  });

  it("opens the writing practice detail page when a writing topic row is clicked", async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.endsWith("/writing-practice/writing-present-yourself")
        ? {
            ok: true,
            json: async () => ({
              id: "writing-present-yourself",
              title: "Present yourself",
              after_grammar_point: "hsk1_existence_with_you",
              context: null,
            }),
          }
        : null,
    );
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState(
        [
          {
            id: "hsk1_existence_with_you",
            hsk_level: 1,
            index: 1,
            title: "Existence with You",
            prerequisites: [],
            status: "TODO",
          },
        ],
        [
          {
            id: "writing-present-yourself",
            title: "Present yourself",
            after_grammar_point: "hsk1_existence_with_you",
          },
        ],
      ),
    });

    await user.click(
      screen.getByRole("button", { name: /Practice: Present yourself/ }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Present yourself" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("tab", { name: "Context" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Writing" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "Grammar" })).toBeInTheDocument();
  });

  it("navigates to the grammar point detail page when a row is clicked", async () => {
    const user = userEvent.setup();
    const listPoint = {
      id: "1|Basic Sentence Structure",
      hsk_level: 1,
      index: 1,
      title: "Basic Sentence Structure",
      prerequisites: [] as string[],
      status: "TODO",
    };
    stubFetch((url) =>
      url.endsWith(`/grammar-points/${encodeURIComponent(listPoint.id)}`)
        ? {
            ok: true,
            json: async () => ({
              ...listPoint,
              explanation: "# Basic Sentence Structure",
              exercises: null,
              new_words: [],
            }),
          }
        : null,
    );
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([listPoint]),
    });

    await user.click(
      screen.getByRole("button", { name: /Basic Sentence Structure/ }),
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Explanation" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("never calls the grammar/hsk-level-light endpoints itself — loading is owned by loadGrammarData", () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({}) }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Basic Sentence Structure",
          hsk_level: 1,
          index: 1,
          title: "Basic Sentence Structure",
          prerequisites: [],
          status: "TODO",
          score: null,
        },
      ]),
    });

    expect(
      screen.getByRole("button", { name: /Basic Sentence Structure/ }),
    ).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some((call) =>
        /grammar-points|hsk-level-light|writing-practices/.test(String(call[0])),
      ),
    ).toBe(false);
  });

  it("shows an error message when loading failed (surfaced from the grammar slice's error field)", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: {
        hsk: { status: null, currentLevelLight: null },
        grammar: {
          items: [],
          writingPractices: [],
          loaded: false,
          error: "Failed to load grammar points.",
          loadStatus: "failed" as const,
          loadedLevels: [],
          quizInProgress: false,
        },
      },
    });

    expect(screen.getByText("Failed to load grammar points.")).toBeInTheDocument();
  });

  it("colors the score green at 80% or above and amber below that", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|High",
          hsk_level: 1,
          index: 1,
          title: "High Score Topic",
          prerequisites: [],
          status: "DONE",
          score: 90,
        },
        {
          id: "1|Low",
          hsk_level: 1,
          index: 2,
          title: "Low Score Topic",
          prerequisites: [],
          status: "WIP",
          score: 40,
        },
      ]),
    });

    expect(screen.getByText("90%")).toHaveClass("grammar-score-good");
    expect(screen.getByText("40%")).toHaveClass("grammar-score-low");
  });

  it("puts the full lesson title on the row so it shows on hover", () => {
    stubFetch();
    renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState([
        {
          id: "1|Basic Sentence Structure",
          hsk_level: 1,
          index: 1,
          title: "Basic Sentence Structure",
          prerequisites: [],
          status: "TODO",
        },
      ]),
    });

    expect(
      screen.getByRole("button", { name: /Basic Sentence Structure/ }),
    ).toHaveAttribute("title", "Basic Sentence Structure");
  });

  it("shows a loading spinner in the status and score cells until that level's data arrives, via mergeGrammarLevelData", () => {
    stubFetch();
    const { container, store } = renderWithStore(<GrammarPage />, {
      preloadedState: preloadedGrammarState(
        [
          {
            id: "1|Basic Sentence Structure",
            hsk_level: 1,
            index: 1,
            title: "Basic Sentence Structure",
            prerequisites: [],
            status: "TODO",
          },
        ],
        [],
        1,
        [], // no level loaded yet
      ),
    });

    const row = container.querySelector("tbody tr")!;
    expect(row.querySelectorAll("td")[2].querySelector("span")).toHaveClass(
      "grammar-cell-spinner",
    );

    act(() => {
      store.dispatch(
        mergeGrammarLevelData({
          hskLevel: 1,
          points: [
            {
              id: "1|Basic Sentence Structure",
              prerequisites: [],
              status: "DONE",
              score: 82,
              usage_count: 1,
            },
          ],
        }),
      );
    });

    expect(screen.getByText("82%")).toBeInTheDocument();
  });
});
