import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListeningPage from "./ListeningPage";
import * as listeningApi from "../utils/listening/listeningApi";

vi.mock("../utils/listening/listeningApi", () => ({
  fetchListeningPractices: vi.fn(),
  fetchListeningPracticeDetail: vi.fn(),
  fetchListeningAudioBlob: vi.fn(),
  fetchListeningAudioSegmentBlob: vi.fn(),
  transcribeListeningAudio: vi.fn(),
}));

const fetchListeningPractices = vi.mocked(listeningApi.fetchListeningPractices);
const fetchListeningPracticeDetail = vi.mocked(
  listeningApi.fetchListeningPracticeDetail,
);

describe("ListeningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only the title and score icon for each practice, ordered by overall score", async () => {
    fetchListeningPractices.mockResolvedValue([
      {
        id: "weak-fit",
        title: "Weak fit lesson",
        hsk_level: 3,
        status: "TODO",
        vocabulary_score: 20,
        grammar_score: 10,
      },
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
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

    // Only name + icon are shown - no level, status, or raw score numbers.
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
      screen.getByText("You already know 100% of this lesson's vocabulary."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You already know 90% of this lesson's grammar."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This listening practice is an excellent fit for your current level!",
      ),
    ).toBeInTheDocument();
  });

  it("opens the practice detail when clicking a lesson card", async () => {
    const user = userEvent.setup();
    fetchListeningPractices.mockResolvedValue([
      {
        id: "best-fit",
        title: "Best fit lesson",
        hsk_level: 1,
        status: "TODO",
        vocabulary_score: 100,
        grammar_score: 90,
      },
    ]);
    fetchListeningPracticeDetail.mockResolvedValue({
      id: "best-fit",
      title: "Best fit lesson",
      hsk_level: 1,
      status: "TODO",
      vocabulary_score: 100,
      grammar_score: 90,
      text: "你好",
      sentences: [],
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
      screen.getByText("You already know 100% of this lesson's vocabulary."),
    ).toBeInTheDocument();
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
