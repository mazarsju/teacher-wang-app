import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";

type AnkiCustomFieldModalProps = {
  isOpen: boolean;
  onConfirm: (title: string, description: string) => void;
  onCancel: () => void;
};

export default function AnkiCustomFieldModal({
  isOpen,
  onConfirm,
  onCancel,
}: AnkiCustomFieldModalProps) {
  const { t } = useTranslation("preferences");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setTitle("");
    setDescription("");
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const trimmedTitle = title.trim();
  const isConfirmDisabled = trimmedTitle === "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isConfirmDisabled) {
      return;
    }
    onConfirm(trimmedTitle, description.trim());
  }

  return (
    <div className="modal-overlay modal-overlay--stacked" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anki-custom-field-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="anki-custom-field-title" className="modal-title">
          {t("ankiCustomFieldModal.title")}
        </h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-field-label">
              {t("ankiCustomFieldModal.titleFieldLabel")}
            </span>
            <input
              type="text"
              value={title}
              placeholder={t("ankiCustomFieldModal.titleFieldPlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="modal-field">
            <span className="modal-field-label">
              {t("ankiCustomFieldModal.descriptionFieldLabel")}
            </span>
            <input
              type="text"
              value={description}
              placeholder={t("ankiCustomFieldModal.descriptionFieldPlaceholder")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <Button kind="cancel" text={t("ankiCustomFieldModal.cancel")} onClick={onCancel} />
            <Button
              kind="confirm"
              htmlType="submit"
              text={t("ankiCustomFieldModal.confirm")}
              disabled={isConfirmDisabled}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
