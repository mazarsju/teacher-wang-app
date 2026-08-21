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
