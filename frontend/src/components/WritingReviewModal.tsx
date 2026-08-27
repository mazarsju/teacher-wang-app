import { useEffect, useState } from "react";
import Button from "./Button";
import ChallengeConfetti from "./ChallengeConfetti";
import styles from "./WritingReviewModal.module.css";

type WritingReviewModalProps = {
  allCorrect: boolean;
  grammarPointTitles: string[];
  onClose: () => void;
};

export default function WritingReviewModal({
  allCorrect,
  grammarPointTitles,
  onClose,
}: WritingReviewModalProps) {
  const [confettiActive, setConfettiActive] = useState(allCorrect);

  useEffect(() => {
    if (!allCorrect) return;
    const timeoutId = window.setTimeout(() => setConfettiActive(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [allCorrect]);

  return (
    <>
      <ChallengeConfetti active={confettiActive} />
      <div className="modal-overlay" onClick={onClose}>
        <div
          className={allCorrect ? "modal-dialog" : "modal-dialog modal-dialog--warning"}
          role="dialog"
          aria-modal="true"
          aria-labelledby="writing-review-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="writing-review-modal-title" className="modal-title">
            {allCorrect ? "Everything is correct!" : "Almost there"}
          </h2>
          <p className="modal-message">
            {allCorrect
              ? "Well done — your text has no grammar mistakes."
              : "Some sentences still have grammar mistakes. Click them to see why, then fix them to validate the text."}
          </p>
          {grammarPointTitles.length > 0 && (
            <>
              <p className="modal-message">Grammar points you used correctly:</p>
              <ul className={styles.writingReviewModalList}>
                {grammarPointTitles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </>
          )}
          <div className="modal-actions">
            <Button kind="confirm" text="OK" onClick={onClose} />
          </div>
        </div>
      </div>
    </>
  );
}
