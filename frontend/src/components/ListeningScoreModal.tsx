import { useTranslation } from "react-i18next";
import Button from "./Button";
import type { ListeningPractice } from "../types/listeningPractice";
import { scoreTier } from "../utils/listening/overallScore";

type ListeningScoreModalProps = {
  practice: ListeningPractice | null;
  onClose: () => void;
};

export default function ListeningScoreModal({
  practice,
  onClose,
}: ListeningScoreModalProps) {
  const { t } = useTranslation("listening");

  if (!practice) {
    return null;
  }

  const tier = scoreTier(practice.vocabulary_score + practice.grammar_score);

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listening-score-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="listening-score-modal-title" className="modal-title">
          {practice.title}
        </h2>
        <p className="modal-message">
          {t("listeningScoreModal.vocabularyKnown", {
            percent: practice.vocabulary_score,
          })}
        </p>
        <p className="modal-message">
          {t("listeningScoreModal.grammarKnown", {
            percent: practice.grammar_score,
          })}
        </p>
        <p className="modal-message">{t(`listeningScoreModal.fit.${tier}`)}</p>
        <div className="modal-actions">
          <Button
            kind="cancel"
            text={t("listeningScoreModal.close")}
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
}
