import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "../test/renderWithStore";
import GrammarPage from "./GrammarPage";

type StubGrammarPoint = {
  id: string;
  hsk_level: number;
  index: number;
  title: string;
  prerequisites: string[];
  status: string;
  score?: number | null;
};

function stubGrammarPointsFetch(points: StubGrammarPoint[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: async () => points })),
  );
}

function stubGrammarPointsAndPlanFetch(points: StubGrammarPoint[], plan: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      if (String(input).endsWith("/auth/me")) {
        return Promise.resolve({ ok: true, json: async () => ({ plan }) });
      }
      return Promise.resolve({ ok: true, json: async () => points });
    }),
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

const HSK1_STATE = {
  hsk: {
    status: {
      current_level: 1,
      next_level: 2,
      characters_to_next_level: 10,
      progress_to_next_level: 50,
      missing_characters: [],
      max_level: 7,
      completion_ratio: 0.5,
    },
  },
};

const HSK2_STATE = {
  hsk: {
    status: {
      current_level: 2,
      next_level: 3,
      characters_to_next_level: 10,
      progress_to_next_level: 50,
      missing_characters: [],
      max_level: 7,
      completion_ratio: 0.85,
    },
  },
};

describe("GrammarPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a lesson row with its number, title, and 'Not started' status", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        index: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Basic Sentence Structure/ }),
      ).toBeInTheDocument(),
    );

    const row = screen.getByRole("button", { name: /Basic Sentence Structure/ });
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByText("Not started")).toBeInTheDocument();
  });

  it("shows a colored, labeled badge for SKIP, WIP, and DONE statuses", async () => {
    stubGrammarPointsFetch([
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
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() => expect(screen.getByText("Skipped")).toBeInTheDocument());

    expect(screen.getByText("Skipped")).toHaveClass("grammar-status-skip");
    expect(screen.getByText("In progress")).toHaveClass("grammar-status-wip");
    expect(screen.getByText("Completed")).toHaveClass("grammar-status-done");
  });

  it("shows the saved score in the score column for a DONE lesson", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Finished",
        hsk_level: 1,
        index: 1,
        title: "Finished Topic",
        prerequisites: [],
        status: "DONE",
        score: 82,
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() => expect(screen.getByText("82%")).toBeInTheDocument());
  });

  it("shows a blue, star-labeled badge and blue score for a MASTERED lesson", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Mastered Topic",
        hsk_level: 1,
        index: 1,
        title: "Mastered Topic",
        prerequisites: [],
        status: "MASTERED",
        score: 82,
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() => expect(screen.getByText("Mastered")).toBeInTheDocument());

    expect(screen.getByText("Mastered")).toHaveClass("grammar-status-mastered");
    expect(screen.getByText("82%")).toHaveClass("grammar-score-mastered");
  });

  it("shows grammar points whose prerequisites aren't all DONE as locked, non-clickable rows", async () => {
    stubGrammarPointsFetch([
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
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Questions with Ma/ }),
      ).toBeInTheDocument(),
    );

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
    const points = [stubGrammarPoint(10), stubGrammarPoint(11)];
    stubGrammarPointsAndPlanFetch(points, "free");

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

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
    const points = [stubGrammarPoint(10), stubGrammarPoint(11)];
    stubGrammarPointsAndPlanFetch(points, "pro");

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Lesson 11/ })).toHaveAttribute(
        "aria-disabled",
        "false",
      ),
    );
  });

  it("shows grammar points one HSK level above the learner's achieved level (the target)", async () => {
    stubGrammarPointsFetch([
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
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Basic Sentence Structure/ }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.getByRole("button", { name: /Target Level Topic/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Advanced Topic/ }),
    ).not.toBeInTheDocument();
  });

  it("treats a SKIP prerequisite as satisfied, same as DONE", async () => {
    stubGrammarPointsFetch([
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
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Questions with Ma/ }),
      ).toHaveAttribute("aria-disabled", "false"),
    );
  });

  it("shows a completion gauge per HSK level up to the target level, excluding levels above that", async () => {
    stubGrammarPointsFetch([
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
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK2_STATE });

    await waitFor(() =>
      expect(
        screen.getByTitle("HSK 1: 50% complete"),
      ).toBeInTheDocument(),
    );

    expect(screen.getByTitle("HSK 2: 100% complete")).toBeInTheDocument();
    expect(screen.getByTitle("HSK 3: 0% complete")).toBeInTheDocument();
    expect(screen.queryByTitle(/HSK 4:/)).not.toBeInTheDocument();
  });

  it("groups lessons into a collapsible, open-by-default section per HSK level", async () => {
    stubGrammarPointsFetch([
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
    ]);

    const { container } = renderWithStore(<GrammarPage />, {
      preloadedState: HSK1_STATE,
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Basic Sentence Structure/ }),
      ).toBeInTheDocument(),
    );

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

  it("shows a writing topic right after the grammar lesson it follows, with a pen icon and a 'Practice:' prefix", async () => {
    stubGrammarPointsFetch([
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
    ]);

    const { container } = renderWithStore(<GrammarPage />, {
      preloadedState: HSK1_STATE,
    });

    await waitFor(() =>
      expect(screen.getByText("Practice: Present yourself")).toBeInTheDocument(),
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe(
      screen.getByRole("button", { name: /Practice: Present yourself/ }),
    );
    expect(rows[2]).toBe(
      screen.getByRole("button", { name: /Next Lesson/ }),
    );
  });

  it("opens the writing practice detail page when a writing topic row is clicked", async () => {
    const user = userEvent.setup();
    stubGrammarPointsFetch([
      {
        id: "hsk1_existence_with_you",
        hsk_level: 1,
        index: 1,
        title: "Existence with You",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Practice: Present yourself/ }),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /Practice: Present yourself/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Present yourself" }),
    ).toBeInTheDocument();
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
      prerequisites: [],
      status: "TODO",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/grammar-points")) {
          return Promise.resolve({ ok: true, json: async () => [listPoint] });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...listPoint,
            explanation: "# Basic Sentence Structure",
            exercises: null,
            new_words: [],
          }),
        });
      }),
    );

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Basic Sentence Structure/ }),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /Basic Sentence Structure/ }),
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Explanation" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    renderWithStore(<GrammarPage />);

    await waitFor(() =>
      expect(
        screen.getByText("Failed to load grammar points."),
      ).toBeInTheDocument(),
    );
  });

  it("colors the score green at 80% or above and amber below that", async () => {
    stubGrammarPointsFetch([
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
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() => expect(screen.getByText("90%")).toBeInTheDocument());

    expect(screen.getByText("90%")).toHaveClass("grammar-score-good");
    expect(screen.getByText("40%")).toHaveClass("grammar-score-low");
  });

  it("puts the full lesson title on the row so it shows on hover", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        index: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Basic Sentence Structure/ }),
      ).toHaveAttribute("title", "Basic Sentence Structure"),
    );
  });
});
