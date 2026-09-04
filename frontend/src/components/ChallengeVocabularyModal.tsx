import { useTranslation } from "react-i18next";
import Button from "./Button";
import GrammarVocabularyTab from "./GrammarVocabularyTab";
import type { ChallengeVocabularyWord } from "../types/challenge";

type ChallengeVocabularyModalProps = {
  isOpen: boolean;
  challengeTitle: string;
  vocabulary: ChallengeVocabularyWord[];
  onClose: () => void;
};

export default function ChallengeVocabularyModal({
  isOpen,
  challengeTitle,
  vocabulary,
  onClose,
}: ChallengeVocabularyModalProps) {
  const { t } = useTranslation("common");

  if (!isOpen) {
    return null;
  }

  const words = vocabulary.map((word) => ({ ...word, level: 0, frequency: 0 }));

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-vocabulary-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="challenge-vocabulary-modal-title" className="modal-title">
          {t("challengeVocabularyModal.title", { challengeTitle })}
        </h2>
        <GrammarVocabularyTab words={words} />
        <div className="modal-actions">
          <Button kind="cancel" text={t("actions.close")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
