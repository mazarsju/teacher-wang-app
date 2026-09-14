import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListeningPracticeDetailPage from "./ListeningPracticeDetailPage";
import { renderWithStore as render } from "../test/renderWithStore";
import * as listeningApi from "../utils/listening/listeningApi";

vi.mock("../utils/listening/listeningApi", () => ({
  fetchListeningPracticeDetail: vi.fn(),
  fetchListeningAudioBlob: vi.fn(),
  fetchListeningAudioSegmentBlob: vi.fn(),
  transcribeListeningAudio: vi.fn(),
  completeListeningPractice: vi.fn(),
}));

const fetchListeningPracticeDetail = vi.mocked(
  listeningApi.fetchListeningPracticeDetail,
);

const detail = {
  id: "listening-family-size",
  title: "How many are in your family?",
  hsk_level: 1,
  type: "dialog",
  topic: "family",
  status: "TODO",
  vocabulary_score: 40,
  grammar_score: 60,
  text: "小美：你家有几个人？\n大卫：我家有五个人。",
  sentences: [
    { id: 1, mandarin: "你家有几个人？", translation: "How many people?" },
    { id: 2, mandarin: "我家有五个人。", translation: "Five people." },
  ],
  exercises: [],
  segment_count: 2,
};

describe("ListeningPracticeDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the four sections once loaded", async () => {
    fetchListeningPracticeDetail.mockResolvedValue(detail);

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await screen.findByRole("heading", {
      name: "How many are in your family?",
    });

    expect(screen.getByText("Listen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Listen to the recording and try to understand what it's about.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Questions")).toBeInTheDocument();
    expect(
      screen.getByText("Test what you understood from the recording."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No exercises available for this listening practice yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Shadowing")).toBeInTheDocument();
    expect(
      screen.getByText(/Listen to each sentence of the recording separately/),
    ).toBeInTheDocument();
    expect(screen.getByText("Full text")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Check the full text and see if you understood everything correctly!",
      ),
    ).toBeInTheDocument();
    // One shadowing row per sentence.
    expect(screen.getAllByRole("button", { name: "Show the sentence" })).toHaveLength(2);
  });

  it("renders one shadowing row per chunk, in order, for a sentence broken into chunks", async () => {
    const fetchListeningAudioSegmentBlob = vi.mocked(
      listeningApi.fetchListeningAudioSegmentBlob,
    );
    fetchListeningAudioSegmentBlob.mockResolvedValue(
      new Blob(["audio"], { type: "audio/mpeg" }),
    );
    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      sentences: [
        { id: 1, mandarin: "你家有几个人？", translation: "How many people?" },
        {
          id: 2,
          mandarin: "我家有五个人，我们住在北京。",
          translation: "There are five in my family, we live in Beijing.",
          chunks: [
            { id: 1, mandarin: "我家有五个人，" },
            { id: 2, mandarin: "我们住在北京。" },
          ],
        },
      ],
    });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await screen.findByRole("heading", {
      name: "How many are in your family?",
    });

    // Sentence 1 (no chunks) + 2 chunks for sentence 2 = 3 shadowing rows.
    expect(
      screen.getAllByRole("button", { name: "Show the sentence" }),
    ).toHaveLength(3);
    expect(screen.getByText("我家有五个人，")).toBeInTheDocument();
    expect(screen.getByText("我们住在北京。")).toBeInTheDocument();
    expect(screen.queryByText("我家有五个人，我们住在北京。")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchListeningAudioSegmentBlob).toHaveBeenCalledWith(
        "listening-family-size",
        2,
        1,
      );
      expect(fetchListeningAudioSegmentBlob).toHaveBeenCalledWith(
        "listening-family-size",
        2,
        2,
      );
    });
  });

  it("blurs the full text until revealed", async () => {
    const user = userEvent.setup();
    fetchListeningPracticeDetail.mockResolvedValue(detail);

    const { container } = render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await screen.findByRole("heading", {
      name: "How many are in your family?",
    });

    const text = container.querySelector(".listening-detail-text");
    expect(text?.textContent).toBe(detail.text);
    expect(text?.className).toMatch(/blurred/i);

    await user.click(screen.getByRole("button", { name: "Show the text" }));
    expect(text?.className).not.toMatch(/blurred/i);
  });

  it("shows the full translation only after clicking the button", async () => {
    const user = userEvent.setup();
    fetchListeningPracticeDetail.mockResolvedValue(detail);

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await screen.findByRole("heading", {
      name: "How many are in your family?",
    });

    expect(screen.queryByText(/How many people\?/)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Show translation" }),
    );

    const translation = screen.getByText(/How many people\?/);
    expect(translation.textContent).toBe("How many people?\nFive people.");
  });

  it("verifying exercises shows the score without persisting anything", async () => {
    const user = userEvent.setup();
    const completeListeningPractice = vi.mocked(
      listeningApi.completeListeningPractice,
    );
    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      exercises: [
        {
          id: "mcq_001",
          type: "multiple_choice",
          question: "How many people?",
          choices: ["3", "5"],
          answer: 1,
        },
      ],
    });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText("You scored 100%."),
    ).toBeInTheDocument();
    expect(completeListeningPractice).not.toHaveBeenCalled();
  });

  it("asks the learner to decide completion at the bottom of the page and persists their choice", async () => {
    const user = userEvent.setup();
    const completeListeningPractice = vi.mocked(
      listeningApi.completeListeningPractice,
    );
    completeListeningPractice.mockResolvedValue({
      status: "DONE",
      vocabulary_score: 40,
      grammar_score: 60,
    });
    fetchListeningPracticeDetail.mockResolvedValue(detail);

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    expect(
      await screen.findByText(
        "Do you consider this listening practice completed?",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes" }));

    expect(completeListeningPractice).toHaveBeenCalledWith(
      "listening-family-size",
      true,
    );
    expect(
      await screen.findByText("Marked as completed."),
    ).toBeInTheDocument();
  });

  it("lets the learner mark a practice as not completed", async () => {
    const user = userEvent.setup();
    const completeListeningPractice = vi.mocked(
      listeningApi.completeListeningPractice,
    );
    completeListeningPractice.mockResolvedValue({
      status: "WIP",
      vocabulary_score: 40,
      grammar_score: 60,
    });
    fetchListeningPracticeDetail.mockResolvedValue(detail);

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "No" }));

    expect(completeListeningPractice).toHaveBeenCalledWith(
      "listening-family-size",
      false,
    );
    expect(
      await screen.findByText("Marked as not completed yet."),
    ).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    fetchListeningPracticeDetail.mockResolvedValue(detail);

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={onBack}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows an error when loading fails", async () => {
    fetchListeningPracticeDetail.mockRejectedValue(
      new Error("Failed to load the listening practice."),
    );

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    expect(
      await screen.findByText("Failed to load the listening practice."),
    ).toBeInTheDocument();
  });
});
