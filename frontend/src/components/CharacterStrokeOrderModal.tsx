import { useTranslation } from "react-i18next";
import Button from "./Button";
import styles from "./CharacterStrokeOrderModal.module.css";

type CharacterStrokeOrderModalProps = {
  isOpen: boolean;
  char: string | null;
  onClose: () => void;
};

export default function CharacterStrokeOrderModal({
  isOpen,
  char,
  onClose,
}: CharacterStrokeOrderModalProps) {
  const { t } = useTranslation("common");

  if (!isOpen || char === null) {
    return null;
  }

  const codePoint = char.codePointAt(0);
  const gifUrl = `https://www.strokeorder.com/assets/bishun/animation/${codePoint}.gif`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-stroke-order-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="character-stroke-order-modal-title" className="modal-title">
          {char}
        </h2>
        <img
          className={styles.characterStrokeOrderModalGif}
          src={gifUrl}
          alt={char}
        />
        <div className="modal-actions">
          <Button kind="cancel" text={t("actions.close")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
