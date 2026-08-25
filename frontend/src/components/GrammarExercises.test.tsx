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
    vi.restoreAllMocks();
  });

  it("shuffles multiple-choice answers on display and reshuffles after Try again", () => {
    vi.useFakeTimers();
    const randomValues = [0, 0.9, 0.9, 0];
    vi.spyOn(Math, "random").mockImplementation(() => randomValues.shift() ?? 0);

    const threeChoices: GrammarExercise = {
      id: "mcq_shuffle",
      type: "multiple_choice",
      question: "Pick one",
      choices: ["A", "B", "C"],
      answer: 0,
    };

    render(<GrammarExercises exercises={[threeChoices]} />);

    const choiceOrder = () =>
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter((text): text is string => !!text && ["A", "B", "C"].includes(text));

    expect(choiceOrder()).toEqual(["C", "B", "A"]);

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    fireEvent.click(screen.getByRole("button", { name: "See score" }));

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(choiceOrder()).toEqual(["B", "A", "C"]);
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

  it("opens the explanation chat immediately for a wrong reorder answer, and flags it correct once Teacher Wang approves it", async () => {
    const user = userEvent.setup();
    let resolveChat: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveChat = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GrammarExercises exercises={[REORDER]} />);

    await user.click(screen.getAllByRole("button", { name: "茶" })[0]);
    await user.click(screen.getAllByRole("button", { name: "我" })[0]);
    await user.click(screen.getAllByRole("button", { name: "喜欢" })[0]);
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(screen.getByText("Not quite.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More explanation" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("Teacher Wang detected this answer as correct"),
    ).not.toBeInTheDocument();

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[0].content).toContain("茶 我 喜欢");
    expect(body.messages[0].content).toContain("我 喜欢 茶");

    await act(async () => {
      resolveChat({
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "YES, that order is also valid." },
        }),
      });
    });

    expect(
      await screen.findByText("Teacher Wang detected this answer as correct"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close chat" }));

    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More explanation" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a wrong reorder answer flagged as wrong when Teacher Wang rejects it in the explanation chat", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "NO, that order is not natural." },
        }),
      }),
    );

    render(<GrammarExercises exercises={[REORDER]} />);

    await user.click(screen.getAllByRole("button", { name: "茶" })[0]);
    await user.click(screen.getAllByRole("button", { name: "我" })[0]);
    await user.click(screen.getAllByRole("button", { name: "喜欢" })[0]);
    await user.click(screen.getByRole("button", { name: "Validate" }));
    await user.click(screen.getByRole("button", { name: "More explanation" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await screen.findByText("NO, that order is not natural.");

    await user.click(screen.getByRole("button", { name: "Close chat" }));

    expect(screen.getByText("Not quite.")).toBeInTheDocument();
    expect(
      screen.queryByText("Teacher Wang detected this answer as correct"),
    ).not.toBeInTheDocument();
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

  it("checks a non-matching translation with Teacher Wang, disabling Validate and the input while waiting", async () => {
    const user = userEvent.setup();
    let resolveChat: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveChat = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    render(<GrammarExercises exercises={[TRANSLATION]} grammarPointTitle="Liking things" />);

    await user.type(screen.getByPlaceholderText("Type your answer"), "wrong");
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(
      screen.getByText(
        "This solution is not the expected one. Checking with Teacher Wang if it is a possible solution. Please wait...",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
    expect(screen.getByPlaceholderText("Type your answer")).toBeDisabled();

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ character_id: "teacher-wang", ephemeral: true });
    expect(body.messages[0].content).toContain("Liking things");
    expect(body.messages[0].content).toContain("我喜欢茶。");
    expect(body.messages[0].content).toContain("wrong");

    resolveChat({
      ok: true,
      json: async () => ({ message: { role: "assistant", content: "NO, that's not correct." } }),
    });

    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
  });

  it("treats a non-matching translation as correct when Teacher Wang approves it", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "YES, that's a valid alternative." },
        }),
      }),
    );

    render(<GrammarExercises exercises={[TRANSLATION]} />);

    await user.type(screen.getByPlaceholderText("Type your answer"), "我很喜欢喝茶。");
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More explanation" }),
    ).not.toBeInTheDocument();
  });

  it("flags a Teacher-Wang-rejected translation as incorrect and preloads that explanation, without a second API call, when More explanation is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          role: "assistant",
          content: "NO, 喜欢 conveys liking, but your sentence means something else.",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GrammarExercises exercises={[TRANSLATION]} />);

    await user.type(screen.getByPlaceholderText("Type your answer"), "wrong");
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
    expect(screen.getByText("Accepted: 我喜欢茶。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "More explanation" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("NO, 喜欢 conveys liking, but your sentence means something else."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Teacher Wang is typing..."),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to incorrect when the Teacher Wang check itself fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    render(<GrammarExercises exercises={[TRANSLATION]} />);

    await user.type(screen.getByPlaceholderText("Type your answer"), "wrong");
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
  });

  it("checks a non-matching transform answer with Teacher Wang", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: "assistant", content: "YES, that's a valid alternative." },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GrammarExercises exercises={[TRANSFORM]} />);

    await user.type(screen.getByPlaceholderText("Type your answer"), "茶，我不喜欢。");
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[0].content).toContain("Make this sentence negative.");
    expect(body.messages[0].content).toContain("我喜欢茶。");
    expect(body.messages[0].content).toContain("茶，我不喜欢。");
  });

  it("flags a Teacher-Wang-rejected transform answer as incorrect", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { role: "assistant", content: "NO, that's wrong." } }),
      }),
    );

    render(<GrammarExercises exercises={[TRANSFORM]} />);

    await user.type(screen.getByPlaceholderText("Type your answer"), "wrong");
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
    expect(screen.getByText("Accepted: 我不喜欢茶。")).toBeInTheDocument();
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
    // The displayed context is a short recap, not the verbose prompt sent to the API.
    expect(container.textContent).toContain("Question:");
    expect(container.textContent).toContain("Wrong answer:");
    expect(container.textContent).toContain("Correct answer:");
    expect(screen.queryByText(/Basic Sentence Structure/)).not.toBeInTheDocument();
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
