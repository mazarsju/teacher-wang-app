import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Word } from "../types/word";
import { isValidChineseWord } from "../utils/knowledgeBase/chineseCharacters";
import { getMissingCharacters } from "../utils/knowledgeBase/wordCharacters";

export type WordFormValues = {
  word: string;
  definition: string;
};

type AddWordModalProps = {
  mode: "add" | "edit";
  isOpen: boolean;
  initialWord?: Word | null;
  knownCharacters: string[];
  existingWords?: string[];
  onConfirm: (values: WordFormValues) => void;
  onCancel: () => void;
  onAddCharacter: (character: string) => void;
};

export default function AddWordModal({
  mode,
  isOpen,
  initialWord = null,
  knownCharacters,
  existingWords = [],
  onConfirm,
  onCancel,
  onAddCharacter,
}: AddWordModalProps) {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");

  const knownCharacterSet = useMemo(
    () => new Set(knownCharacters),
    [knownCharacters],
  );

  const existingWordSet = useMemo(
    () => new Set(existingWords),
    [existingWords],
  );

  const missingCharacters = useMemo(
    () => (mode === "add" ? getMissingCharacters(word, knownCharacterSet) : []),
    [mode, word, knownCharacterSet],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode === "edit" && initialWord) {
      setWord(initialWord.word);
      setDefinition(initialWord.definition ?? "");
      return;
    }

    setWord("");
    setDefinition("");
  }, [isOpen, mode, initialWord]);

  if (!isOpen) {
    return null;
  }

  const trimmedWord = word.trim();
  const hasInvalidChineseCharacters =
    mode === "add" && trimmedWord !== "" && !isValidChineseWord(word);
  const isDuplicateWord =
    mode === "add" && trimmedWord !== "" && existingWordSet.has(trimmedWord);
  const isConfirmDisabled =
    mode === "add" &&
    (trimmedWord === "" ||
      hasInvalidChineseCharacters ||
      missingCharacters.length > 0 ||
      isDuplicateWord);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isConfirmDisabled) {
      return;
    }

    onConfirm({
      word: word.trim(),
      definition: definition.trim(),
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
              onChange={(event) => setWord(event.target.value)}
            />
          </label>
          {hasInvalidChineseCharacters && (
            <p className="form-warning">
              Word must contain only Chinese characters.
            </p>
          )}
          {missingCharacters.map((character) => (
            <div key={character} className="form-warning-row">
              <p className="form-warning">
                &quot;{character}&quot; does not exist yet in the database and
                needs to be added priorly.
              </p>
              <button
                type="button"
                className="form-warning-action"
                onClick={() => onAddCharacter(character)}
              >
                Add character {character}
              </button>
            </div>
          ))}
          {isDuplicateWord && (
            <p className="form-warning">
              This word already exists in the database.
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
