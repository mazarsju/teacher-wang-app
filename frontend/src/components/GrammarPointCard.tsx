import Button from "./Button";
import type { GrammarPoint } from "../types/grammarPoint";
import styles from "./GrammarPointCard.module.css";

type GrammarPointCardProps = {
  grammarPoint: GrammarPoint;
  onSelect: (grammarPoint: GrammarPoint) => void;
  canSkip?: boolean;
  onSkip?: (grammarPoint: GrammarPoint) => void;
};

export default function GrammarPointCard({
  grammarPoint,
  onSelect,
  canSkip = false,
  onSkip,
}: GrammarPointCardProps) {
  return (
    <div className={styles.grammarPointCard}>
      <button
        type="button"
        className={styles.grammarPointCardMain}
        onClick={() => onSelect(grammarPoint)}
      >
        <div className={styles.grammarPointCardHeader}>
          <span className={styles.grammarPointCardLevel}>
            HSK {grammarPoint.hsk_level}
          </span>
          {grammarPoint.status !== "TODO" && (
            <span
              className={`${styles.grammarPointCardStatus} ${
                styles[`grammar-point-card-status-${grammarPoint.status.toLowerCase()}`] ?? ""
              }`}
            >
              {grammarPoint.status}
            </span>
          )}
        </div>
        <h3 className={styles.grammarPointCardTitle}>{grammarPoint.title}</h3>
      </button>
      {canSkip && (
        <Button
          kind="confirm"
          variant="table"
          text="Know already"
          onClick={() => onSkip?.(grammarPoint)}
        />
      )}
    </div>
  );
}
