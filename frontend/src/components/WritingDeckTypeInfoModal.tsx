import { useTranslation } from "react-i18next";
import Button from "./Button";

type WritingDeckTypeInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function WritingDeckTypeInfoModal({
  isOpen,
  onClose,
}: WritingDeckTypeInfoModalProps) {
  const { t } = useTranslation("preferences");

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="writing-deck-type-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="writing-deck-type-info-title" className="modal-title">
          {t("writingDeckTypeInfoModal.title")}
        </h2>
        <p className="home-hsk-info-text">{t("writingDeckTypeInfoModal.text")}</p>
        <div className="modal-actions">
          <Button kind="confirm" text={t("writingDeckTypeInfoModal.close")} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
