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
  saveListeningProgress: vi.fn(),
}));

const fetchListeningPracticeDetail = vi.mocked(
  listeningApi.fetchListeningPracticeDetail,
);
const saveListeningProgress = vi.mocked(listeningApi.saveListeningProgress);

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
    {
      id: 1,
      mandarin: "你家有几个人？",
      translation: "How many people?",
      speaker: "小美",
    },
    {
      id: 2,
      mandarin: "我家有五个人。",
      translation: "Five people.",
      speaker: "大卫",
    },
  ],
  exercises: [],
  bonus_question: null,
  progress: null,
  segment_count: 2,
  man_name: "大卫",
  woman_name: "小美",
};

describe("ListeningPracticeDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveListeningProgress.mockResolvedValue(undefined);
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

  it("shows the man/woman speaker pictures and names for a dialog practice", async () => {
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

    const headerImages = container.querySelectorAll(
      ".listening-detail-speaker-image",
    );
    expect(headerImages).toHaveLength(2);
    expect(headerImages[0]).toHaveAttribute("alt", "Woman speaker");
    expect(headerImages[1]).toHaveAttribute("alt", "Man speaker");
    expect(screen.getByText("小美")).toBeInTheDocument();
    expect(screen.getByText("大卫")).toBeInTheDocument();
  });

  it("shows the matching speaker picture before each shadowing audio player", async () => {
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

    const shadowingImages = container.querySelectorAll(
      ".shadowing-sentence-speaker-image",
    );
    // One per sentence: 小美 (sentence 1), 大卫 (sentence 2).
    expect(shadowingImages).toHaveLength(2);
    expect(shadowingImages[0]).toHaveAttribute("alt", "Woman speaker");
    expect(shadowingImages[1]).toHaveAttribute("alt", "Man speaker");
  });

  it("does not show speaker pictures for a non-dialog practice", async () => {
    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      type: "fiction_story",
      man_name: null,
      woman_name: null,
      sentences: detail.sentences.map((sentence) => ({
        ...sentence,
        speaker: "",
      })),
    });

    const { container } = render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await screen.findByRole("heading", {
      name: "How many are in your family?",
    });

    expect(screen.queryByAltText("Woman speaker")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Man speaker")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(".shadowing-sentence-speaker-image"),
    ).toHaveLength(0);
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
        {
          id: 1,
          mandarin: "你家有几个人？",
          translation: "How many people?",
          speaker: "小美",
        },
        {
          id: 2,
          mandarin: "我家有五个人，我们住在北京。",
          translation: "There are five in my family, we live in Beijing.",
          speaker: "大卫",
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

  it("saves progress when Verify is clicked, and restores the previous answers/score on reload", async () => {
    const user = userEvent.setup();
    const exercises = [
      {
        id: "mcq_001",
        type: "multiple_choice" as const,
        question: "How many people?",
        choices: ["3", "5"],
        answer: 1,
      },
    ];
    fetchListeningPracticeDetail.mockResolvedValue({ ...detail, exercises });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(saveListeningProgress).toHaveBeenCalledWith("listening-family-size", {
        exercises: { mcq_001: 1 },
        shadowing: {},
        bonus: null,
      }),
    );

    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      exercises,
      progress: { exercises: { mcq_001: 1 }, shadowing: {}, bonus: null },
    });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    expect(
      await screen.findAllByText("You scored 100%."),
    ).not.toHaveLength(0);
  });

  it("saves shadowing progress when Check is clicked, keyed by sentence id", async () => {
    const user = userEvent.setup();
    fetchListeningPracticeDetail.mockResolvedValue(detail);

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    const inputs = await screen.findAllByPlaceholderText(
      "Type or record what you hear...",
    );
    await user.type(inputs[0], "你家有几个人？");
    await user.click(screen.getAllByRole("button", { name: "Check" })[0]);

    await waitFor(() =>
      expect(saveListeningProgress).toHaveBeenCalledWith("listening-family-size", {
        exercises: {},
        shadowing: { "1": { text: "你家有几个人？", result: "correct" } },
        bonus: null,
      }),
    );
  });

  it("restores a saved shadowing answer into its input on reload", async () => {
    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      progress: {
        exercises: {},
        shadowing: { "1": { text: "你家有几个人？", result: "correct" } },
        bonus: null,
      },
    });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    const inputs = await screen.findAllByPlaceholderText(
      "Type or record what you hear...",
    );
    expect(inputs[0]).toHaveValue("你家有几个人？");
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

  it("shows the bonus writing question at the bottom of the page when present", async () => {
    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      bonus_question: "How many people are in your family? Describe them.",
    });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    expect(await screen.findByText("Bonus: Writing practice")).toBeInTheDocument();
    expect(
      screen.getByText("How many people are in your family? Describe them."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });

  it("does not show the bonus writing section when there is no bonus question", async () => {
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
    expect(screen.queryByText("Bonus: Writing practice")).not.toBeInTheDocument();
  });

  it("saves bonus progress when its Submit is clicked", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/writing/check-topic-relevance")) {
          return { ok: true, json: async () => ({ on_topic: true }) };
        }
        if (url.endsWith("/writing/check-sentence")) {
          return { ok: true, json: async () => ({ severity: "none" }) };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      }),
    );
    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      bonus_question: "Describe your family.",
    });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    await user.type(await screen.findByLabelText("Your answer"), "我家有五个人和一只猫。");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      const call = saveListeningProgress.mock.calls.at(-1);
      expect(call?.[0]).toBe("listening-family-size");
      expect(call?.[1].bonus).toMatchObject([{ text: "我家有五个人和一只猫。", severity: "none" }]);
    });

    vi.unstubAllGlobals();
  });

  it("restores a saved bonus answer as already-reviewed sentences on reload", async () => {
    fetchListeningPracticeDetail.mockResolvedValue({
      ...detail,
      bonus_question: "Describe your family.",
      progress: {
        exercises: {},
        shadowing: {},
        bonus: [
          {
            id: "0",
            paragraphIndex: 0,
            text: "我家有五个人和一只猫。",
            status: "done",
            severity: "none",
            answer: null,
            grammarPointsCovered: [],
          },
        ],
      },
    });

    render(
      <ListeningPracticeDetailPage
        topicId="listening-family-size"
        onBack={() => {}}
      />,
    );

    const sentence = await screen.findByText("我家有五个人和一只猫。");
    expect(sentence.className).toContain("bonus-sentence--none");
    expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();
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
