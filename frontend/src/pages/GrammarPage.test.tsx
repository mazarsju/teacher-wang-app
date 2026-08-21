import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "../test/renderWithStore";
import GrammarPage from "./GrammarPage";

type StubGrammarPoint = {
  id: string;
  hsk_level: number;
  title: string;
  prerequisites: string[];
  status: string;
  score?: number | null;
};

function stubGrammarPointsFetch(
  points: StubGrammarPoint[],
  { skipOk = true }: { skipOk?: boolean } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/skip")) {
        return Promise.resolve({ ok: skipOk });
      }

      return Promise.resolve({ ok: true, json: async () => points });
    }),
  );
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

  it("renders a card with its HSK level and title, hiding the TODO status", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
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

    expect(
      screen.getByText("HSK 1", { selector: ".grammar-point-card-level" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("TODO")).not.toBeInTheDocument();
  });

  it("shows a colored badge for SKIP, WIP, and DONE statuses", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Skipped",
        hsk_level: 1,
        title: "Skipped Topic",
        prerequisites: [],
        status: "SKIP",
      },
      {
        id: "1|In Progress",
        hsk_level: 1,
        title: "In Progress Topic",
        prerequisites: [],
        status: "WIP",
      },
      {
        id: "1|Finished",
        hsk_level: 1,
        title: "Finished Topic",
        prerequisites: [],
        status: "DONE",
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(screen.getByText("SKIP")).toBeInTheDocument(),
    );

    expect(screen.getByText("SKIP")).toHaveClass(
      "grammar-point-card-status-skip",
    );
    expect(screen.getByText("WIP")).toHaveClass(
      "grammar-point-card-status-wip",
    );
    expect(screen.getByText("DONE")).toHaveClass(
      "grammar-point-card-status-done",
    );
  });

  it("shows the saved score next to a DONE status badge", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Finished",
        hsk_level: 1,
        title: "Finished Topic",
        prerequisites: [],
        status: "DONE",
        score: 82,
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(screen.getByText("DONE · 82%")).toBeInTheDocument(),
    );
  });

  it("shows grammar points whose prerequisites aren't all DONE as locked, non-clickable cards", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "DONE",
      },
      {
        id: "1|Questions with Ma",
        hsk_level: 1,
        title: "Questions with Ma",
        prerequisites: ["1|Basic Sentence Structure"],
        status: "TODO",
      },
      {
        id: "1|Negation",
        hsk_level: 1,
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
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Questions with Ma/ }),
    ).toBeEnabled();
    // Its prerequisite ("Questions with Ma") isn't DONE/SKIP yet, so it's
    // shown but locked rather than hidden.
    expect(
      screen.getByRole("button", { name: /Negation with Bu/ }),
    ).toBeDisabled();
  });

  it("shows grammar points one HSK level above the learner's achieved level (the target)", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "TODO",
      },
      {
        id: "2|Target Level Topic",
        hsk_level: 2,
        title: "Target Level Topic",
        prerequisites: [],
        status: "TODO",
      },
      {
        id: "3|Advanced Topic",
        hsk_level: 3,
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
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "SKIP",
      },
      {
        id: "1|Questions with Ma",
        hsk_level: 1,
        title: "Questions with Ma",
        prerequisites: ["1|Basic Sentence Structure"],
        status: "TODO",
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK1_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Questions with Ma/ }),
      ).toBeEnabled(),
    );
  });

  it('shows "Know already" for TODO topics at or below the current level, not the target level', async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "TODO",
      },
      {
        id: "1|Already Skipped",
        hsk_level: 1,
        title: "Already Skipped Topic",
        prerequisites: [],
        status: "SKIP",
      },
      {
        id: "2|Current Level Topic",
        hsk_level: 2,
        title: "Current Level Topic",
        prerequisites: [],
        status: "TODO",
      },
      {
        id: "3|Target Level Topic",
        hsk_level: 3,
        title: "Target Level Topic",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK2_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Target Level Topic/ }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.getAllByRole("button", { name: "Know already" }),
    ).toHaveLength(2);
    expect(
      within(
        screen.getByRole("button", { name: /Target Level Topic/ }).parentElement!,
      ).queryByRole("button", { name: "Know already" }),
    ).not.toBeInTheDocument();
  });

  it("shows a completion gauge per HSK level up to the target level, excluding levels above that", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Done",
        hsk_level: 1,
        title: "Done Topic",
        prerequisites: [],
        status: "DONE",
      },
      {
        id: "1|Todo",
        hsk_level: 1,
        title: "Todo Topic",
        prerequisites: [],
        status: "TODO",
      },
      {
        id: "2|Skip",
        hsk_level: 2,
        title: "Skipped Topic",
        prerequisites: [],
        status: "SKIP",
      },
      {
        id: "3|Todo",
        hsk_level: 3,
        title: "Target Level Topic",
        prerequisites: [],
        status: "TODO",
      },
      {
        id: "4|Todo",
        hsk_level: 4,
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

  it('marks a topic as SKIP and hides its "Know already" button after clicking it', async () => {
    const user = userEvent.setup();
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    renderWithStore(<GrammarPage />, { preloadedState: HSK2_STATE });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Know already" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Know already" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Know already" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("SKIP")).toBeInTheDocument();
  });

  it("collapses completed (DONE/SKIP) topics into a closed 'Completed grammar topics' section", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "DONE",
      },
      {
        id: "1|Questions with Ma",
        hsk_level: 1,
        title: "Questions with Ma Topic",
        prerequisites: [],
        status: "SKIP",
      },
      {
        id: "1|Negation",
        hsk_level: 1,
        title: "Negation Topic",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    const { container } = renderWithStore(<GrammarPage />, {
      preloadedState: HSK1_STATE,
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Negation Topic/ }),
      ).toBeInTheDocument(),
    );

    const detailsElement = container.querySelector("details");
    expect(detailsElement).not.toBeNull();
    expect(detailsElement?.open).toBe(false);
    expect(
      within(detailsElement as HTMLElement).getByRole("button", {
        name: /Basic Sentence Structure/,
      }),
    ).toBeInTheDocument();
    expect(
      within(detailsElement as HTMLElement).getByRole("button", {
        name: /Questions with Ma Topic/,
      }),
    ).toBeInTheDocument();
    // The still-TODO topic stays in the main grid, outside the details section.
    expect(
      within(detailsElement as HTMLElement).queryByRole("button", {
        name: /Negation Topic/,
      }),
    ).not.toBeInTheDocument();
  });

  it("puts even a single completed topic into the collapsible section", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "DONE",
      },
      {
        id: "1|Negation",
        hsk_level: 1,
        title: "Negation Topic",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    const { container } = renderWithStore(<GrammarPage />, {
      preloadedState: HSK1_STATE,
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Negation Topic/ }),
      ).toBeInTheDocument(),
    );

    const detailsElement = container.querySelector("details");
    expect(detailsElement).not.toBeNull();
    expect(detailsElement?.open).toBe(false);
    expect(
      within(detailsElement as HTMLElement).getByRole("button", {
        name: /Basic Sentence Structure/,
      }),
    ).toBeInTheDocument();
  });

  it("shows no collapsible section when nothing is DONE or SKIP yet", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Negation",
        hsk_level: 1,
        title: "Negation Topic",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    const { container } = renderWithStore(<GrammarPage />, {
      preloadedState: HSK1_STATE,
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Negation Topic/ }),
      ).toBeInTheDocument(),
    );

    expect(container.querySelector("details")).toBeNull();
  });

  it("navigates to the grammar point detail page when a card is clicked", async () => {
    const user = userEvent.setup();
    const listPoint = {
      id: "1|Basic Sentence Structure",
      hsk_level: 1,
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
});
