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

describe("ListeningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshListeningPractices.mockResolvedValue(undefined);
  });

  it("shows the title, type/topic badges, and score icon for each practice, ordered by overall score", async () => {
    fetchListeningPractices.mockResolvedValue([
      {
        id: "weak-fit",
        title: "Weak fit lesson",
        hsk_level: 3,
        type: "dialog",
        topic: "travel",
        status: "TODO",
        vocabulary_score: 20,
        grammar_score: 10,
      },
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "fiction_story",
        topic: "animals",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]);

    render(<ListeningPage />);

    await screen.findByText("Best fit lesson");
    const titles = screen
      .getAllByText(/lesson$/)
      .map((element) => element.textContent);
    expect(titles).toEqual(["Best fit lesson", "Weak fit lesson"]);

    expect(screen.getByText("Story")).toBeInTheDocument();
    expect(screen.getByText("Animals")).toBeInTheDocument();
    expect(screen.getByText("Dialog")).toBeInTheDocument();
    expect(screen.getByText("Travel")).toBeInTheDocument();

    // No level, status, or raw score numbers.
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.queryByText("TODO")).not.toBeInTheDocument();
    expect(screen.queryByText("20%")).not.toBeInTheDocument();
  });

  it("opens the score dialog when clicking a lesson's icon", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue([
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]);

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
    fetchListeningPractices.mockResolvedValue([
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]);
    fetchListeningPracticeDetail.mockResolvedValue({
      id: "best-fit",
      title: "Best fit lesson",
      hsk_level: 1,
      type: "dialog",
      topic: "family",
      status: "TODO",
      vocabulary_score: 100,
      grammar_score: 90,
      text: "你好",
      sentences: [],
      exercises: [],
      segment_count: 0,
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
    fetchListeningPractices.mockResolvedValue([
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]);

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
    fetchListeningPractices.mockResolvedValue([
      {
        id: "active-one",
        title: "Active lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
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
        status: "DONE",
        vocabulary_score: 100,
        grammar_score: 100,
      },
    ]);

    render(<ListeningPage />);

    await screen.findByText("Active lesson");

    expect(screen.getByText("Completed practices (1)")).toBeInTheDocument();
    expect(screen.getByText("Done lesson")).not.toBeVisible();

    await user.click(screen.getByText("Completed practices (1)"));

    expect(screen.getByText("Done lesson")).toBeVisible();
  });

  it("does not show the completed section when nothing is completed yet", async () => {
    fetchListeningPractices.mockResolvedValue([
      {
        id: "active-one",
        title: "Active lesson",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        status: "TODO",
        vocabulary_score: 50,
        grammar_score: 50,
      },
    ]);

    render(<ListeningPage />);

    await screen.findByText("Active lesson");

    expect(screen.queryByText(/Completed practices/)).not.toBeInTheDocument();
  });

  it("shows an empty message when there are no listening practices", async () => {
    fetchListeningPractices.mockResolvedValue([]);

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
