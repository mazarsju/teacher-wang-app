import type { Word } from "../types/word";
import { formatAssociatedWord } from "../utils/knowledgeBase/wordsByCharacter";
import Button from "./Button";
import styles from "./CharacterWordsModal.module.css";

type CharacterWordsModalProps = {
  isOpen: boolean;
  character: string | null;
  words: Word[];
  onClose: () => void;
};

export default function CharacterWordsModal({
  isOpen,
  character,
  words,
  onClose,
}: CharacterWordsModalProps) {
  if (!isOpen || character === null) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-words-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="character-words-modal-title" className="modal-title">
          {character}
        </h2>
        <div className={styles.characterWordsModalContent}>
          <p className={styles.characterWordsModalHeading}>Associated words:</p>
          <ul className={styles.characterWordsModalList}>
            {words.map((word) => (
              <li key={word.word}>{formatAssociatedWord(word)}</li>
            ))}
          </ul>
        </div>
        <div className="modal-actions">
          <Button kind="cancel" text="Close" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
