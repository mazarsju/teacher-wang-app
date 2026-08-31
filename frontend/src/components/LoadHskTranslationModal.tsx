import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";

export type HskTranslationFormValues = {
  file: File;
  language: string;
};

type LoadHskTranslationModalProps = {
  isOpen: boolean;
  onConfirm: (values: HskTranslationFormValues) => void;
  onCancel: () => void;
};

export default function LoadHskTranslationModal({
  isOpen,
  onConfirm,
  onCancel,
}: LoadHskTranslationModalProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFile(null);
    setLanguage("en");
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    onConfirm({ file, language });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-hsk-translation-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="load-hsk-translation-title" className="modal-title">
          {t("admin:adminPage.loadTranslationModal.title")}
        </h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-field-label">
              {t("admin:adminPage.loadTranslationModal.fileLabel")}
            </span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="modal-field">
            <span className="modal-field-label">
              {t("admin:adminPage.loadTranslationModal.languageLabel")}
            </span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en">
                {t("admin:adminPage.loadTranslationModal.languageOptions.en")}
              </option>
              <option value="fr">
                {t("admin:adminPage.loadTranslationModal.languageOptions.fr")}
              </option>
            </select>
          </label>
          <div className="modal-actions">
            <Button
              kind="cancel"
              text={t("common:confirmModal.cancel")}
              onClick={onCancel}
            />
            <Button
              kind="confirm"
              text={t("common:confirmModal.confirm")}
              htmlType="submit"
              disabled={!file}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
