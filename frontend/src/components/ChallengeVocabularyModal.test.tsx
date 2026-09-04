import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChallengeVocabularyModal from "./ChallengeVocabularyModal";
import { renderWithStore } from "../test/renderWithStore";

const VOCABULARY = [
  { id: "fuwuyuan", word: "服务员", pinyin: "fu2 wu4 yuan2", definition: "waiter" },
  { id: "maidan", word: "买单", pinyin: "mai3 dan1", definition: "to pay the bill" },
];

describe("ChallengeVocabularyModal", () => {
  it("renders nothing when closed", () => {
    renderWithStore(
      <ChallengeVocabularyModal
        isOpen={false}
        challengeTitle="Waiter"
        vocabulary={VOCABULARY}
        onClose={() => undefined}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the vocabulary list and closes on button click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithStore(
      <ChallengeVocabularyModal
        isOpen
        challengeTitle="Waiter"
        vocabulary={VOCABULARY}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Vocabulary for Waiter")).toBeInTheDocument();
    expect(screen.getByText("服务员 - fu2 wu4 yuan2")).toBeInTheDocument();
    expect(screen.getByText("买单 - mai3 dan1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
