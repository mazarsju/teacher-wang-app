import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { AnkiCustomFieldDef } from "../types/anki";
import type { Word } from "../types/word";
import {
  buildPinyinFromCharacterMap,
  isWordPinyinValid,
} from "../utils/knowledgeBase/wordCharacters";
import Button from "./Button";
import styles from "./AddWordModal.module.css";

export type WordFormValues = {
  word: string;
  definition: string;
  pinyin: string;
  writing_known: boolean;
  custom_fields: Record<string, string>;
};

type AddWordModalProps = {
  mode: "add" | "edit";
  isOpen: boolean;
  initialWord?: Word | null;
  existingWords?: string[];
  hskCharacterPinyin: Record<string, string>;
  characterPinyin: Record<string, string>;
  customFields?: AnkiCustomFieldDef[];
  onConfirm: (values: WordFormValues) => void;
  onCancel: () => void;
};

export default function AddWordModal({
  mode,
  isOpen,
  initialWord = null,
  existingWords = [],
  hskCharacterPinyin,
  characterPinyin,
  customFields = [],
  onConfirm,
  onCancel,
}: AddWordModalProps) {
  const { t } = useTranslation("common");
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [writingKnown, setWritingKnown] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const existingWordSet = useMemo(
    () => new Set(existingWords),
    [existingWords],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (initialWord) {
      setWord(initialWord.word);
      setDefinition(initialWord.definition ?? "");
      setPinyin(initialWord.pinyin ?? "");
      setWritingKnown(initialWord.writing_known);
      setCustomValues(initialWord.custom_fields ?? {});
      return;
    }

    setWord("");
    setDefinition("");
    setPinyin("");
    setWritingKnown(false);
    setCustomValues({});
  }, [isOpen, mode, initialWord]);

  if (!isOpen) {
    return null;
  }

  const trimmedWord = word.trim();
  const trimmedPinyin = pinyin.trim();
  const trimmedDefinition = definition.trim();
  const isDuplicateWord =
    mode === "add" && trimmedWord !== "" && existingWordSet.has(trimmedWord);
  const isPinyinValid =
    trimmedPinyin !== "" && isWordPinyinValid(word, pinyin);
  const showPinyinWarning = trimmedPinyin !== "" && !isPinyinValid;
  const isDefinitionTooLong = trimmedDefinition.length > 100;
  const isConfirmDisabled =
    trimmedWord === "" ||
    trimmedDefinition === "" ||
    !isPinyinValid ||
    isDefinitionTooLong ||
    (mode === "add" && isDuplicateWord);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isConfirmDisabled) {
      return;
    }

    onConfirm({
      word: word.trim(),
      definition: definition.trim(),
      pinyin: pinyin.trim(),
      writing_known: writingKnown,
      custom_fields: customValues,
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="word-form-title" className="modal-title">
          {mode === "add" ? t("addWordModal.titleAdd") : t("addWordModal.titleEdit")}
        </h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-field-label">{t("addWordModal.wordLabel")}</span>
            <input
              type="text"
              value={word}
              readOnly={mode === "edit"}
              maxLength={10}
              onChange={(event) => {
                const newWord = event.target.value;
                setWord(newWord);
                setPinyin(
                  buildPinyinFromCharacterMap(
                    newWord,
                    hskCharacterPinyin,
                    characterPinyin,
                  ),
                );
              }}
            />
          </label>
          {isDuplicateWord && (
            <p className={styles.formWarning}>
              {t("addWordModal.duplicateWarning")}
            </p>
          )}
          <label className="modal-field">
            <span className="modal-field-label">{t("addWordModal.pinyinLabel")}</span>
            <input
              type="text"
              value={pinyin}
              maxLength={64}
              aria-invalid={showPinyinWarning}
              aria-describedby={showPinyinWarning ? "word-pinyin-warning" : undefined}
              onChange={(event) => setPinyin(event.target.value)}
            />
          </label>
          {showPinyinWarning && (
            <p id="word-pinyin-warning" className={styles.formWarning}>
              {t("addWordModal.pinyinWarning")}
            </p>
          )}
          <label className="modal-field">
            <span className="modal-field-label">{t("addWordModal.definitionLabel")}</span>
            <input
              type="text"
              value={definition}
              aria-invalid={isDefinitionTooLong}
              aria-describedby={
                isDefinitionTooLong ? "word-definition-warning" : undefined
              }
              onChange={(event) => setDefinition(event.target.value)}
            />
          </label>
          {isDefinitionTooLong && (
            <p id="word-definition-warning" className={styles.formWarning}>
              {t("addWordModal.definitionTooLong")}
            </p>
          )}
          {customFields.map((field) => (
            <label key={field.id} className="modal-field">
              <span className="modal-field-label">
                {field.title}{" "}
                {field.description !== "" && (
                  <span className={styles.fieldHint}>
                    ({field.description})
                  </span>
                )}
              </span>
              <input
                type="text"
                value={customValues[field.id] ?? ""}
                onChange={(event) =>
                  setCustomValues((current) => ({
                    ...current,
                    [field.id]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <label className="modal-field-toggle">
            <span className="modal-field-label">{t("addWordModal.writingKnownLabel")}</span>
            <span className="toggle">
              <input
                type="checkbox"
                role="switch"
                checked={writingKnown}
                onChange={(event) => setWritingKnown(event.target.checked)}
              />
              <span className="toggle-slider" />
            </span>
          </label>
          <div className="modal-actions">
            <Button kind="cancel" text={t("confirmModal.cancel")} onClick={onCancel} />
            <Button
              kind="confirm"
              text={t("confirmModal.confirm")}
              htmlType="submit"
              disabled={isConfirmDisabled}
            />
          </div>
        </form>
      </div>
    </div>
  );
}
