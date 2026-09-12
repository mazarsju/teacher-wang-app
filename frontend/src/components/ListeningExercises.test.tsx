import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListeningExercises from "./ListeningExercises";

const exercises = [
  {
    id: "mcq_001",
    type: "multiple_choice" as const,
    question: "How many people are in David's family?",
    choices: ["3", "5"],
    answer: 1,
  },
  {
    id: "mcq_002",
    type: "multiple_choice" as const,
    question: "Does Xiaomei have an older brother?",
    choices: ["Yes", "No"],
    answer: 1,
  },
];

describe("ListeningExercises", () => {
  it("shows an empty message when there are no exercises", () => {
    render(<ListeningExercises exercises={[]} />);

    expect(
      screen.getByText("No exercises available for this listening practice yet."),
    ).toBeInTheDocument();
  });

  it("disables Verify until every question is answered", async () => {
    const user = userEvent.setup();
    render(<ListeningExercises exercises={exercises} />);

    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "5" }));
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled();
  });

  it("computes and shows the score when all answers are correct", async () => {
    const user = userEvent.setup();
    render(<ListeningExercises exercises={exercises} />);

    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(screen.getByText("You scored 100%.")).toBeInTheDocument();
    expect(
      screen.getByText("Great job! You got a passing score."),
    ).toBeInTheDocument();
  });

  it("reports a failing score below 80%", async () => {
    const user = userEvent.setup();
    render(<ListeningExercises exercises={exercises} />);

    // Wrong answer for the first question, correct for the second -> 50%.
    await user.click(screen.getByRole("button", { name: "3" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(screen.getByText("You scored 50%.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Try listening to the recording again to improve your understanding.",
      ),
    ).toBeInTheDocument();
  });

  it("hides the score again once an answer changes after verifying", async () => {
    const user = userEvent.setup();
    render(<ListeningExercises exercises={exercises} />);

    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(screen.getByText("You scored 100%.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "3" }));
    expect(screen.queryByText(/You scored/)).not.toBeInTheDocument();
  });
});
