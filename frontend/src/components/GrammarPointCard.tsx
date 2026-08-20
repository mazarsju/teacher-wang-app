import type { GrammarPoint } from "../types/grammarPoint";
import styles from "./GrammarPointCard.module.css";

type GrammarPointCardProps = {
  grammarPoint: GrammarPoint;
  onSelect: (grammarPoint: GrammarPoint) => void;
};

export default function GrammarPointCard({
  grammarPoint,
  onSelect,
}: GrammarPointCardProps) {
  return (
    <button
      type="button"
      className={styles.grammarPointCard}
      onClick={() => onSelect(grammarPoint)}
    >
      <span className={styles.grammarPointCardLevel}>
        HSK {grammarPoint.hsk_level}
      </span>
      <h3 className={styles.grammarPointCardTitle}>{grammarPoint.title}</h3>
      <span className={styles.grammarPointCardStatus}>
        {grammarPoint.status}
      </span>
    </button>
  );
}
