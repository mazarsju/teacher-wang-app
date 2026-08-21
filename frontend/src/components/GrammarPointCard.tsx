import Button from "./Button";
import { LockIcon } from "./icons";
import type { GrammarPoint } from "../types/grammarPoint";
import styles from "./GrammarPointCard.module.css";

type GrammarPointCardProps = {
  grammarPoint: GrammarPoint;
  onSelect: (grammarPoint: GrammarPoint) => void;
  locked?: boolean;
  canSkip?: boolean;
  onSkip?: (grammarPoint: GrammarPoint) => void;
};

export default function GrammarPointCard({
  grammarPoint,
  onSelect,
  locked = false,
  canSkip = false,
  onSkip,
}: GrammarPointCardProps) {
  return (
    <div
      className={
        locked
          ? `${styles.grammarPointCard} ${styles.grammarPointCardLocked}`
          : styles.grammarPointCard
      }
    >
      <button
        type="button"
        className={styles.grammarPointCardMain}
        onClick={() => onSelect(grammarPoint)}
        disabled={locked}
      >
        <div className={styles.grammarPointCardHeader}>
          <span className={styles.grammarPointCardLevel}>
            HSK {grammarPoint.hsk_level}
          </span>
          {locked ? (
            <LockIcon className={styles.grammarPointCardLockIcon} />
          ) : (
            grammarPoint.status !== "TODO" && (
              <span
                className={`${styles.grammarPointCardStatus} ${
                  styles[`grammar-point-card-status-${grammarPoint.status.toLowerCase()}`] ?? ""
                }`}
              >
                {grammarPoint.status}
                {grammarPoint.score != null && ` · ${grammarPoint.score}%`}
              </span>
            )
          )}
        </div>
        <h3 className={styles.grammarPointCardTitle}>{grammarPoint.title}</h3>
      </button>
      {canSkip && !locked && (
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
