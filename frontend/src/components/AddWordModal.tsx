import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Word } from "../types/word";
import {
  buildPinyinFromCharacterMap,
  isWordPinyinValid,
} from "../utils/knowledgeBase/wordCharacters";

export type WordFormValues = {
  word: string;
  definition: string;
  pinyin: string;
  writing_known: boolean;
};

type AddWordModalProps = {
  mode: "add" | "edit";
  isOpen: boolean;
  initialWord?: Word | null;
  existingWords?: string[];
  hskCharacterPinyin: Record<string, string>;
  characterPinyin: Record<string, string>;
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
  onConfirm,
  onCancel,
}: AddWordModalProps) {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [writingKnown, setWritingKnown] = useState(false);

  const existingWordSet = useMemo(
    () => new Set(existingWords),
    [existingWords],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode === "edit" && initialWord) {
      setWord(initialWord.word);
      setDefinition(initialWord.definition ?? "");
      setPinyin(initialWord.pinyin ?? "");
      setWritingKnown(initialWord.writing_known);
      return;
    }

    setWord("");
    setDefinition("");
    setPinyin("");
    setWritingKnown(false);
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
  const isConfirmDisabled =
    trimmedWord === "" ||
    trimmedDefinition === "" ||
    !isPinyinValid ||
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
          {mode === "add" ? "Add word" : "Edit word"}
        </h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span className="modal-field-label">words</span>
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
            <p className="form-warning">
              This word already exists in the database.
            </p>
          )}
          <label className="modal-field">
            <span className="modal-field-label">pinyin</span>
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
            <p id="word-pinyin-warning" className="form-warning">
              Enter one valid pinyin syllable per Chinese character (e.g.
              hao3), with a tone number. Any non-Chinese characters in the
              word don&rsquo;t need matching pinyin — spacing and content
              around them are not checked.
            </p>
          )}
          <label className="modal-field">
            <span className="modal-field-label">definition</span>
            <input
              type="text"
              value={definition}
              maxLength={100}
              onChange={(event) => setDefinition(event.target.value)}
            />
          </label>
          <label className="modal-field-toggle">
            <span className="modal-field-label">writing known</span>
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
            <button type="button" className="modal-button-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="modal-button-confirm-primary"
              disabled={isConfirmDisabled}
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
