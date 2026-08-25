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
  const plural = grammarPointTitles.length > 1;

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
          Grammar mastered!
        </h2>
        <p className="modal-message">
          You just proved you&apos;ve mastered {plural ? "these lessons" : "this lesson"}{" "}
          by using {plural ? "them" : "it"} in a real conversation:
        </p>
        <ul className={styles.grammarMasteryModalList}>
          {grammarPointTitles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
        <div className="modal-actions">
          <Button kind="confirm" text="Nice!" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
