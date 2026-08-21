import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "../test/renderWithStore";
import GrammarPointDetailPage from "./GrammarPointDetailPage";

function stubDetailFetch(detail: {
  id: string;
  hsk_level: number;
  title: string;
  prerequisites: string[];
  status: string;
  explanation: string | null;
  exercises: unknown;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => detail }),
  );
}

const SAMPLE_DETAIL = {
  id: "1|Basic Sentence Structure",
  hsk_level: 1,
  title: "Basic Sentence Structure",
  prerequisites: [],
  status: "TODO",
  explanation: "## Overview\n\nSubject + Verb + Object.",
  exercises: [
    {
      id: "mcq_001",
      type: "multiple_choice",
      question: "Which sentence means 'I like tea'?",
      choices: ["我喜欢茶。", "我喝茶。"],
      answer: 0,
    },
  ],
};

describe("GrammarPointDetailPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the topic title and renders the explanation Markdown by default", async () => {
    stubDetailFetch(SAMPLE_DETAIL);

    renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Basic Sentence Structure", level: 1 }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.getByRole("heading", { name: "Overview", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Subject \+ Verb \+ Object\./)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Explanation" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("collapses runs of blank lines in the explanation before rendering", async () => {
    stubDetailFetch({
      ...SAMPLE_DETAIL,
      explanation: "Line one.\n\n\nLine two.",
    });

    const { container } = renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
    );

    await waitFor(() =>
      expect(screen.getByText("Line one.")).toBeInTheDocument(),
    );

    const explanationContainer = container.querySelector(
      ".grammar-detail-explanation",
    ) as HTMLElement;
    // Two lines of text, no leftover blank-line spans between them.
    expect(explanationContainer.querySelectorAll("span")).toHaveLength(2);
    expect(screen.getByText("Line two.")).toBeInTheDocument();
  });

  it("switches to the Exercises tab, showing the first exercise", async () => {
    const user = userEvent.setup();
    stubDetailFetch(SAMPLE_DETAIL);

    renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Exercises" })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("tab", { name: "Exercises" }));

    expect(
      screen.getByText("Which sentence means 'I like tea'?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Subject \+ Verb \+ Object\./)).not.toBeVisible();
  });

  it("shows a fallback message when there's no explanation yet", async () => {
    stubDetailFetch({ ...SAMPLE_DETAIL, explanation: null });

    renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("No explanation available yet."),
      ).toBeInTheDocument(),
    );
  });

  it("calls onBack when the Back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    stubDetailFetch(SAMPLE_DETAIL);

    renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={onBack} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("keeps exercise progress when switching to Explanation and back", async () => {
    const user = userEvent.setup();
    stubDetailFetch(SAMPLE_DETAIL);

    renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Exercises" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("tab", { name: "Exercises" }));

    await user.click(screen.getByRole("button", { name: "我喜欢茶。" }));
    expect(screen.getByRole("button", { name: "我喜欢茶。" })).toHaveClass(
      "choice-selected",
    );

    await user.click(screen.getByRole("tab", { name: "Explanation" }));
    expect(screen.getByText(/Subject \+ Verb \+ Object\./)).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Exercises" }));
    expect(screen.getByRole("button", { name: "我喜欢茶。" })).toHaveClass(
      "choice-selected",
    );
  });

  it("asks for confirmation before leaving a quiz in progress via the Back button", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    stubDetailFetch(SAMPLE_DETAIL);

    renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={onBack} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Exercises" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("tab", { name: "Exercises" }));
    await user.click(screen.getByRole("button", { name: "我喜欢茶。" }));

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("saves the score to the backend and updates the store when the quiz finishes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/complete")) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => SAMPLE_DETAIL });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { store } = renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
      {
        preloadedState: {
          grammar: {
            items: [{ ...SAMPLE_DETAIL, score: null }],
            quizInProgress: false,
          },
        },
      },
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Exercises" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("tab", { name: "Exercises" }));
    await user.click(screen.getByRole("button", { name: "我喜欢茶。" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));
    await user.click(screen.getByRole("button", { name: "See score" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/complete"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ score: 100 }),
        }),
      ),
    );
    expect(store.getState().grammar.items[0]).toMatchObject({
      status: "DONE",
      score: 100,
    });
  });

  it("marks the grammar point WIP instead of DONE when the score is below 80%", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/complete")) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => SAMPLE_DETAIL });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { store } = renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
      {
        preloadedState: {
          grammar: {
            items: [{ ...SAMPLE_DETAIL, score: null }],
            quizInProgress: false,
          },
        },
      },
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Exercises" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("tab", { name: "Exercises" }));
    await user.click(screen.getByRole("button", { name: "我喝茶。" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));
    await user.click(screen.getByRole("button", { name: "See score" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/complete"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ score: 0 }),
        }),
      ),
    );
    expect(store.getState().grammar.items[0]).toMatchObject({
      status: "WIP",
      score: 0,
    });
  });

  it("shows an error message when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    renderWithStore(
      <GrammarPointDetailPage grammarId={SAMPLE_DETAIL.id} onBack={() => {}} />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Failed to load grammar topic."),
      ).toBeInTheDocument(),
    );
  });
});
