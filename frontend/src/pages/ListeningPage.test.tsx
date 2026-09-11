import { render, screen } from "@testing-library/react";
import ListeningPage from "./ListeningPage";
import * as listeningApi from "../utils/listening/listeningApi";

vi.mock("../utils/listening/listeningApi", () => ({
  fetchListeningPractices: vi.fn(),
}));

const fetchListeningPractices = vi.mocked(listeningApi.fetchListeningPractices);

describe("ListeningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the listening practices with their scores", async () => {
    fetchListeningPractices.mockResolvedValue([
      {
        id: "listening-family-size",
        title: "How many are in your family?",
        hsk_level: 1,
        status: "TODO",
        vocabulary_score: 40,
        grammar_score: 60,
      },
    ]);

    render(<ListeningPage />);

    expect(
      await screen.findByText("How many are in your family?"),
    ).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("To do")).toBeInTheDocument();
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
