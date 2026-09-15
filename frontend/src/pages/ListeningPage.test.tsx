import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListeningPage from "./ListeningPage";
import { renderWithStore } from "../test/renderWithStore";
import * as listeningApi from "../utils/listening/listeningApi";

vi.mock("../utils/listening/listeningApi", () => ({
  fetchListeningPractices: vi.fn(),
  refreshListeningPractices: vi.fn(),
  fetchListeningPracticeDetail: vi.fn(),
  fetchListeningAudioBlob: vi.fn(),
  fetchListeningAudioSegmentBlob: vi.fn(),
  transcribeListeningAudio: vi.fn(),
  completeListeningPractice: vi.fn(),
}));

const fetchListeningPractices = vi.mocked(listeningApi.fetchListeningPractices);
const refreshListeningPractices = vi.mocked(listeningApi.refreshListeningPractices);
const fetchListeningPracticeDetail = vi.mocked(
  listeningApi.fetchListeningPracticeDetail,
);

function render(ui: Parameters<typeof renderWithStore>[0]) {
  return renderWithStore(ui);
}

// The percentage is wrapped in its own <strong>, so the sentence's text is
// split across elements and a plain screen.getByText(fullString) won't match.
function getByTextContent(text: string) {
  return screen.getByText(
    (_, element) => element?.textContent === text,
  );
}

function withPractices(
  practices: Parameters<typeof fetchListeningPractices.mockResolvedValue>[0]["practices"],
  currentHskLevel = 1,
) {
  return { practices, currentHskLevel };
}

describe("ListeningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshListeningPractices.mockResolvedValue(undefined);
  });

  it("shows the title, type/topic badges, and score icon for each practice, ordered by overall score", async () => {
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "weak-fit",
        title: "Weak fit lesson",
        hsk_level: 3,
        type: "dialog",
        topic: "technology",
        translated_topic: "Technology",
        status: "TODO",
        vocabulary_score: 20,
        grammar_score: 10,
      },
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "fiction_story",
        topic: "pets",
        translated_topic: "Pets",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]));

    render(<ListeningPage />);

    await screen.findByText("Best fit lesson");
    const titles = screen
      .getAllByText(/lesson$/)
      .map((element) => element.textContent);
    expect(titles).toEqual(["Best fit lesson", "Weak fit lesson"]);

    // { selector: "span" } excludes the "Type" filter dropdown's <option>s,
    // which share the same translated labels as these badges.
    expect(screen.getByText("Story", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Pets")).toBeInTheDocument();
    expect(screen.getByText("Dialog", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Technology")).toBeInTheDocument();

    // No level, status, or raw score numbers.
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.queryByText("TODO")).not.toBeInTheDocument();
    expect(screen.queryByText("20%")).not.toBeInTheDocument();
  });

  it("shows a topic image instead of a text badge when one exists for the topic", async () => {
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "with-image",
        title: "Sport lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "sport",
        translated_topic: "Sport",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
      {
        id: "without-image",
        title: "Technology lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "technology",
        translated_topic: "Technology",
        status: "TODO",
        vocabulary_score: 20,
        grammar_score: 10,
      },
    ]));

    render(<ListeningPage />);

    await screen.findByText("Sport lesson");
    expect(screen.getByRole("img", { name: "Sport" })).toBeInTheDocument();
    expect(screen.queryByText("Sport")).not.toBeInTheDocument();
    expect(screen.getByText("Technology")).toBeInTheDocument();
  });

  it("opens the score dialog when clicking a lesson's icon", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]));

    render(<ListeningPage />);

    await user.click(
      await screen.findByRole("button", {
        name: 'See your level for "Best fit lesson"',
      }),
    );

    expect(
      getByTextContent("You already know 100% of this lesson's vocabulary."),
    ).toBeInTheDocument();
    expect(screen.getByText("100%")).toHaveClass("tier-excellent");
    expect(
      getByTextContent("You already know 90% of this lesson's grammar."),
    ).toBeInTheDocument();
    expect(screen.getByText("90%")).toHaveClass("tier-good");
    const fitMessage = screen.getByText(
      "This listening practice is an excellent fit for your current level!",
    );
    expect(fitMessage).toBeInTheDocument();
    expect(fitMessage).toHaveClass("tier-excellent");
  });

  it("opens the practice detail when clicking a lesson card", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]));
    fetchListeningPracticeDetail.mockResolvedValue({
      id: "best-fit",
      title: "Best fit lesson",
      hsk_level: 1,
      type: "dialog",
      topic: "family",
      translated_topic: "Family",
      status: "TODO",
      vocabulary_score: 100,
      grammar_score: 90,
      text: "你好",
      sentences: [],
      exercises: [],
      segment_ids: [],
    });

    render(<ListeningPage />);

    await user.click(await screen.findByText("Best fit lesson"));

    expect(
      await screen.findByRole("heading", { name: "Best fit lesson" }),
    ).toBeInTheDocument();
    expect(fetchListeningPracticeDetail).toHaveBeenCalledWith("best-fit");
  });

  it("clicking the score icon does not open the practice detail", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]));

    render(<ListeningPage />);

    await user.click(
      await screen.findByRole("button", {
        name: 'See your level for "Best fit lesson"',
      }),
    );

    expect(fetchListeningPracticeDetail).not.toHaveBeenCalled();
    expect(
      getByTextContent("You already know 100% of this lesson's vocabulary."),
    ).toBeInTheDocument();
  });

  it("moves completed practices into a collapsed section, separate from the active mosaic", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "active-one",
        title: "Active lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
      {
        id: "done-one",
        title: "Done lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "DONE",
        vocabulary_score: 100,
        grammar_score: 100,
      },
    ]));

    render(<ListeningPage />);

    await screen.findByText("Active lesson");

    expect(screen.getByText("Completed practices (1)")).toBeInTheDocument();
    expect(screen.getByText("Done lesson")).not.toBeVisible();

    await user.click(screen.getByText("Completed practices (1)"));

    expect(screen.getByText("Done lesson")).toBeVisible();
  });

  it("does not show the completed section when nothing is completed yet", async () => {
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "active-one",
        title: "Active lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
    ]));

    render(<ListeningPage />);

    await screen.findByText("Active lesson");

    expect(screen.queryByText(/Completed practices/)).not.toBeInTheDocument();
  });

  it("offers only the HSK levels present among the user's practices, filters by the selected one", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "level-1",
        title: "Level 1 lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
      {
        id: "level-3",
        title: "Level 3 lesson",
        hsk_level: 3,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
    ]));

    render(<ListeningPage />);
    await screen.findByText("Level 1 lesson");

    const hskSelect = screen.getByLabelText("HSK level");
    expect(
      Array.from(hskSelect.querySelectorAll("option")).map((option) => option.textContent),
    ).toEqual(["All levels", "HSK 1", "HSK 3"]);

    await user.selectOptions(hskSelect, "3");

    expect(screen.queryByText("Level 1 lesson")).not.toBeInTheDocument();
    expect(screen.getByText("Level 3 lesson")).toBeInTheDocument();
  });

  it("filters practices by type", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "a-dialog",
        title: "Dialog lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
      {
        id: "a-story",
        title: "Story lesson",
        hsk_level: 1,
        type: "fiction_story",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
    ]));

    render(<ListeningPage />);
    await screen.findByText("Dialog lesson");

    await user.selectOptions(screen.getByLabelText("Type"), "fiction_story");

    expect(screen.queryByText("Dialog lesson")).not.toBeInTheDocument();
    expect(screen.getByText("Story lesson")).toBeInTheDocument();
  });

  it("shows only good-fit, near-level practices when Made for you is on, and a fit message when none match", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(
      withPractices(
        [
          {
            id: "good-fit-near-level",
            title: "Good fit lesson",
            hsk_level: 2,
            type: "dialog",
            topic: "family",
            translated_topic: "Family",
            status: "TODO",
            vocabulary_score: 90,
            grammar_score: 90,
          },
          {
            id: "good-fit-far-level",
            title: "Far level lesson",
            hsk_level: 5,
            type: "dialog",
            topic: "family",
            translated_topic: "Family",
            status: "TODO",
            vocabulary_score: 90,
            grammar_score: 90,
          },
          {
            id: "poor-fit-near-level",
            title: "Poor fit lesson",
            hsk_level: 2,
            type: "dialog",
            topic: "family",
            translated_topic: "Family",
            status: "TODO",
            vocabulary_score: 10,
            grammar_score: 10,
          },
        ],
        2,
      ),
    );

    render(<ListeningPage />);
    await screen.findByText("Good fit lesson");

    await user.click(screen.getByRole("switch", { name: "Made for you" }));

    expect(screen.getByText("Good fit lesson")).toBeInTheDocument();
    expect(screen.queryByText("Far level lesson")).not.toBeInTheDocument();
    expect(screen.queryByText("Poor fit lesson")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("HSK level"), "5");

    expect(screen.queryByText("Good fit lesson")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "There's no listening practice that fits your current level yet. Try completing more grammar lessons and building up a stronger knowledge base before coming back to this section.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a generic no-results message when a non-made-for-you filter matches nothing", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue(withPractices([
      {
        id: "a-dialog",
        title: "Dialog lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "Family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
    ]));

    render(<ListeningPage />);
    await screen.findByText("Dialog lesson");

    await user.selectOptions(screen.getByLabelText("Type"), "personal_story");

    expect(
      screen.getByText("No listening practice matches these filters."),
    ).toBeInTheDocument();
  });

  it("shows an empty message when there are no listening practices", async () => {
    fetchListeningPractices.mockResolvedValue(withPractices([]));

    render(<ListeningPage />);

    expect(
      await screen.findByText("No listening practices available yet."),
    ).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    fetchListeningPractices.mockRejectedValue(
      new Error("Failed to load listening practices."),
    );

    render(<ListeningPage />);

    expect(
      await screen.findByText("Failed to load listening practices."),
    ).toBeInTheDocument();
  });
});
