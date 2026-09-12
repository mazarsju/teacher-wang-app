import { Trans, useTranslation } from "react-i18next";
import Button from "./Button";
import type { ListeningPractice } from "../types/listeningPractice";
import { scoreTier, type ScoreTier } from "../utils/listening/overallScore";
import styles from "./ListeningScoreModal.module.css";

type ListeningScoreModalProps = {
  practice: ListeningPractice | null;
  onClose: () => void;
};

function percentTier(percent: number): ScoreTier {
  if (percent === 100) return "excellent";
  if (percent >= 80) return "good";
  if (percent >= 60) return "fair";
  return "poor";
}

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
          <Trans
            i18nKey="listeningScoreModal.vocabularyKnown"
            t={t}
            values={{ percent: practice.vocabulary_score }}
            components={{
              1: (
                <strong
                  className={
                    styles[`tier-${percentTier(practice.vocabulary_score)}`]
                  }
                />
              ),
            }}
          />
        </p>
        <p className="modal-message">
          <Trans
            i18nKey="listeningScoreModal.grammarKnown"
            t={t}
            values={{ percent: practice.grammar_score }}
            components={{
              1: (
                <strong
                  className={
                    styles[`tier-${percentTier(practice.grammar_score)}`]
                  }
                />
              ),
            }}
          />
        </p>
        <p className={`modal-message ${styles[`tier-${tier}`]}`}>
          {t(`listeningScoreModal.fit.${tier}`)}
        </p>
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
