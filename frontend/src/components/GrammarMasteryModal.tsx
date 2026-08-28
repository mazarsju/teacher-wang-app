import { useTranslation } from "react-i18next";
import Button from "./Button";
import styles from "./GrammarMasteryModal.module.css";

type GrammarMasteryModalProps = {
  grammarPointTitles: string[];
  onClose: () => void;
};

export default function GrammarMasteryModal({
  grammarPointTitles,
  onClose,
}: GrammarMasteryModalProps) {
  const { t } = useTranslation("common");

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grammar-mastery-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="grammar-mastery-modal-title" className="modal-title">
          {t("grammarMasteryModal.title")}
        </h2>
        <p className="modal-message">
          {t("grammarMasteryModal.masteredMessage", {
            count: grammarPointTitles.length,
          })}
        </p>
        <ul className={styles.grammarMasteryModalList}>
          {grammarPointTitles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <div className="modal-actions">
          <Button kind="confirm" text={t("grammarMasteryModal.niceButton")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
