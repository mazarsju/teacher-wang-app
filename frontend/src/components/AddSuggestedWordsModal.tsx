import { useEffect, useState } from "react";
import Table, { type TableColumn } from "./Table";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { syncAppData } from "../store/thunks/syncAppData";
import type { HskWord } from "../types/hskWord";
import { extractCharacterEntries } from "../utils/knowledgeBase/buildImportLines";
import { bulkCreateCharacters } from "../utils/knowledgeBase/charactersApi";
import { getSuggestedHskWords, ignoreHskWords } from "../utils/knowledgeBase/hskWordsApi";
import { bulkCreateWords } from "../utils/knowledgeBase/wordsApi";
import Button from "./Button";
import kbInitWizardStyles from "./KnowledgeBaseInitWizardModal.module.css";
import styles from "./AddSuggestedWordsModal.module.css";

type AddSuggestedWordsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AddSuggestedWordsModal({
  isOpen,
  onClose,
}: AddSuggestedWordsModalProps) {
  const dispatch = useAppDispatch();
  const knownCharacters = useAppSelector((state) => state.characters.items);

  const [suggestions, setSuggestions] = useState<HskWord[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedWords(new Set());
    setError(null);
    setIsLoading(true);

    getSuggestedHskWords()
      .then(setSuggestions)
      .catch((fetchError) => {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load suggested words.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function toggleSelected(word: string) {
    setSelectedWords((previous) => {
      const next = new Set(previous);
      if (next.has(word)) {
        next.delete(word);
      } else {
        next.add(word);
      }
      return next;
    });
  }

  async function handleIgnore(words: string[]) {
    if (words.length === 0) {
      return;
    }

    setError(null);
    try {
      const updated = await ignoreHskWords(words);
      setSuggestions(updated);
      setSelectedWords((previous) => {
        const next = new Set(previous);
        for (const word of words) {
          next.delete(word);
        }
        return next;
      });
    } catch (ignoreError) {
      setError(
        ignoreError instanceof Error ? ignoreError.message : "Failed to ignore the word(s).",
      );
    }
  }

  async function handleConfirm() {
    const selected = suggestions.filter((word) => selectedWords.has(word.word));
    if (selected.length === 0) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const knownCharacterSet = new Set(knownCharacters.map((character) => character.char));
      const characterEntries = extractCharacterEntries(
        selected.map((word) => ({
          word: word.word,
          pinyin: word.pinyin,
          definition: word.definition,
          knownToWrite: false,
        })),
      ).filter((entry) => !knownCharacterSet.has(entry.char));

      if (characterEntries.length > 0) {
        await bulkCreateCharacters(characterEntries);
      }
      await bulkCreateWords(
        selected.map((word) => ({
          word: word.word,
          definition: word.definition.trim().slice(0, 100) || null,
        })),
      );
      await dispatch(syncAppData()).unwrap();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to add the selected words.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const columns: TableColumn<HskWord>[] = [
    {
      key: "id",
      header: "",
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.word}`}
          checked={selectedWords.has(row.word)}
          onChange={() => toggleSelected(row.word)}
        />
      ),
    },
    {
      key: "word",
      header: "Word",
      render: (row) => (
        <>
          <p className={kbInitWizardStyles.wizardWordCellPrimary}>
            {row.word} - {row.pinyin}
          </p>
          <p className={kbInitWizardStyles.wizardWordCellDefinition}>
            ({row.definition})
          </p>
        </>
      ),
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-dialog ${kbInitWizardStyles.kbInitWizardDialogWide}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-suggested-words-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-suggested-words-title" className="modal-title">
          Words to learn next
        </h2>
        <p className="modal-message">
          The following words are the most strategic for you to learn.
        </p>

        {isLoading && <p className="modal-message">Loading suggestions…</p>}
        {error && <p className="table-error">{error}</p>}

        {!isLoading && (
          <Table
            columns={columns}
            rows={suggestions}
            compact
            getRowKey={(row) => row.word}
            emptyMessage="No more words to suggest right now."
            renderRowActions={(row) => (
              <Button
                kind="confirm"
                variant="table"
                text="Ignore"
                onClick={() => void handleIgnore([row.word])}
              />
            )}
          />
        )}

        {!isLoading && suggestions.length > 0 && (
          <p className={`modal-message ${styles.suggestedWordsIgnoreAll}`}>
            None of those words interest you? You can ignore them all so that
            other words are proposed to you:{" "}
            <Button
              kind="cancel"
              text="Ignore all words"
              onClick={() => void handleIgnore(suggestions.map((word) => word.word))}
            />
          </p>
        )}

        <div className="modal-actions">
          <Button
            kind="cancel"
            text="Cancel"
            onClick={onClose}
            disabled={isSubmitting}
          />
          <Button
            kind="confirm"
            text="Confirm"
            onClick={() => void handleConfirm()}
            disabled={selectedWords.size === 0 || isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
