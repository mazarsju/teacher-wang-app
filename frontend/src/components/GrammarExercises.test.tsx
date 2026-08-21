import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GrammarExercise } from "../types/grammarPoint";
import GrammarExercises from "./GrammarExercises";

const MCQ: GrammarExercise = {
  id: "mcq_001",
  type: "multiple_choice",
  question: "Which sentence means 'I like tea'?",
  choices: ["我喜欢茶。", "我喝茶。"],
  answer: 0,
};

const REORDER: GrammarExercise = {
  id: "reorder_001",
  type: "sentence_reordering",
  tokens: ["喜欢", "我", "茶"],
  answer: ["我", "喜欢", "茶"],
};

const TRANSLATION: GrammarExercise = {
  id: "tr_001",
  type: "translation",
  prompt: "I like tea.",
  accepted_answers: ["我喜欢茶。"],
};

const TRANSFORM: GrammarExercise = {
  id: "transform_001",
  type: "transform",
  source: "我喜欢茶。",
  instruction: "Make this sentence negative.",
  accepted_answers: ["我不喜欢茶。"],
};

describe("GrammarExercises", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a fallback message when there are no exercises", () => {
    render(<GrammarExercises exercises={[]} />);

    expect(screen.getByText("No exercises available yet.")).toBeInTheDocument();
  });

  it("validates a correct multiple_choice answer and advances on Next", async () => {
    const user = userEvent.setup();
    render(<GrammarExercises exercises={[MCQ, TRANSLATION]} />);

    await user.click(screen.getByRole("button", { name: "我喜欢茶。" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(screen.getByText("Correct!")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("I like tea.")).toBeInTheDocument();
  });

  it("builds an answer for sentence_reordering by tapping tokens in order", async () => {
    const user = userEvent.setup();
    render(<GrammarExercises exercises={[REORDER]} />);

    await user.click(screen.getAllByRole("button", { name: "我" })[0]);
    await user.click(screen.getAllByRole("button", { name: "喜欢" })[0]);
    await user.click(screen.getAllByRole("button", { name: "茶" })[0]);
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });

  it("shows a generic instruction before the translation prompt", () => {
    render(<GrammarExercises exercises={[TRANSLATION]} />);

    expect(
      screen.getByText("Translate the following sentence into Chinese:"),
    ).toBeInTheDocument();
    expect(screen.getByText("I like tea.")).toBeInTheDocument();
  });

  it("shows the transform instruction and the source sentence to transform", () => {
    render(<GrammarExercises exercises={[TRANSFORM]} />);

    expect(screen.getByText("Make this sentence negative.")).toBeInTheDocument();
    expect(screen.getByText("我喜欢茶。")).toBeInTheDocument();
  });

  it("flags an incorrect translation and shows the accepted answer", async () => {
    const user = userEvent.setup();
    render(<GrammarExercises exercises={[TRANSLATION]} />);

    await user.type(screen.getByPlaceholderText("Type your answer"), "wrong");
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(screen.getByText("Not quite.")).toBeInTheDocument();
    expect(screen.getByText("Accepted: 我喜欢茶。")).toBeInTheDocument();
  });

  it("shows a 'More explanation' button only after a wrong answer, not a correct one", async () => {
    const user = userEvent.setup();
    render(<GrammarExercises exercises={[MCQ]} />);

    await user.click(screen.getByRole("button", { name: "我喜欢茶。" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(
      screen.queryByRole("button", { name: "More explanation" }),
    ).not.toBeInTheDocument();
  });

  it("opens the chat modal immediately with the context and a typing indicator, then the reply", async () => {
    const user = userEvent.setup();
    let resolveChat: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/chat")) {
        return new Promise((resolve) => {
          resolveChat = resolve;
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <GrammarExercises exercises={[MCQ]} grammarPointTitle="Basic Sentence Structure" />,
    );

    await user.click(screen.getByRole("button", { name: "我喝茶。" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));
    await user.click(screen.getByRole("button", { name: "More explanation" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Basic Sentence Structure/)).toBeInTheDocument();
    // The seeded context is background text, not a "you asked this" chat bubble.
    expect(container.querySelector(".chat-message--user")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Teacher Wang is typing..."),
    ).toBeInTheDocument();

    resolveChat({
      ok: true,
      json: async () => ({
        message: {
          role: "assistant",
          content: "喝 means 'to drink', not 'to like' — 喜欢 is the verb for liking something.",
        },
      }),
    });

    expect(
      await screen.findByText(
        "喝 means 'to drink', not 'to like' — 喜欢 is the verb for liking something.",
      ),
    ).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls.find(([callUrl]) =>
      String(callUrl).endsWith("/chat"),
    )!;
    expect(String(url)).toContain("/chat");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ character_id: "teacher-wang", ephemeral: true });
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain("Basic Sentence Structure");
    expect(body.messages[0].content).toContain("我喝茶。");
    expect(body.messages[0].content).toContain("我喜欢茶。");
  });

  it("shows an error inside the already-open modal when the explanation request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    render(<GrammarExercises exercises={[MCQ]} />);

    await user.click(screen.getByRole("button", { name: "我喝茶。" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));
    await user.click(screen.getByRole("button", { name: "More explanation" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      await screen.findByText("Failed to send chat message."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the passing score message once all questions are answered", async () => {
    const user = userEvent.setup();
    render(<GrammarExercises exercises={[MCQ]} />);

    await user.click(screen.getByRole("button", { name: "我喜欢茶。" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));
    await user.click(screen.getByRole("button", { name: "See score" }));

    expect(
      screen.getByText("You scored 100%. Great job, you passed this test!"),
    ).toBeInTheDocument();
  });

  it("plays the challenge-complete confetti once a passing score's gauge animation settles", () => {
    vi.useFakeTimers();
    render(<GrammarExercises exercises={[MCQ]} />);

    fireEvent.click(screen.getByRole("button", { name: "我喜欢茶。" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    fireEvent.click(screen.getByRole("button", { name: "See score" }));

    expect(document.body.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(document.body.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("shows the encouraging low-score message and allows restarting once the gauge animation settles", () => {
    vi.useFakeTimers();
    render(<GrammarExercises exercises={[MCQ]} />);

    fireEvent.click(screen.getByRole("button", { name: "我喝茶。" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    fireEvent.click(screen.getByRole("button", { name: "See score" }));

    expect(screen.getByText(/You scored 0%/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Question 1 of 1")).toBeInTheDocument();
  });
});
