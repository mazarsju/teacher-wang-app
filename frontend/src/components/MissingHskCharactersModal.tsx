import { useEffect, useState } from "react";
import { API_BASE } from "../utils/apiBase";
import { apiFetch } from "../utils/auth/apiFetch";

type HskWordEntry = {
  id: string;
  word: string;
  level: number;
  frequency: number;
  pinyin: string;
  definition: string;
};

type MissingHskCharactersModalProps = {
  isOpen: boolean;
  level: number | null;
  characters: string[];
  onClose: () => void;
};

async function fetchHskCharacterWords(
  character: string,
  level: number,
): Promise<HskWordEntry[]> {
  const response = await apiFetch(
    `${API_BASE}/hsk-characters/${encodeURIComponent(character)}/words?level=${level}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error("Failed to load HSK words for this character.");
  }

  return (await response.json()) as HskWordEntry[];
}

export default function MissingHskCharactersModal({
  isOpen,
  level,
  characters,
  onClose,
}: MissingHskCharactersModalProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [words, setWords] = useState<HskWordEntry[]>([]);
  const [isLoadingWords, setIsLoadingWords] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedCharacter(null);
      setWords([]);
      setWordsError(null);
      setIsLoadingWords(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedCharacter === null || level === null) {
      return;
    }

    let isMounted = true;
    setIsLoadingWords(true);
    setWordsError(null);
    setWords([]);

    void fetchHskCharacterWords(selectedCharacter, level)
      .then((loadedWords) => {
        if (isMounted) {
          setWords(loadedWords);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setWordsError(
            error instanceof Error
              ? error.message
              : "Failed to load HSK words for this character.",
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingWords(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCharacter, level]);

  if (!isOpen || level === null) {
    return null;
  }

  const closeWordsModal = () => {
    setSelectedCharacter(null);
    setWords([]);
    setWordsError(null);
    setIsLoadingWords(false);
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="missing-hsk-characters-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="missing-hsk-characters-title" className="modal-title">
            Missing characters for HSK {level}
          </h2>
          <div className="character-words-modal-content">
            {characters.length === 0 ? (
              <p className="character-words-modal-heading">
                No missing characters — this level is complete.
              </p>
            ) : (
              <>
                <p className="home-missing-characters-hint">
                  (those characters are ordered by frequency. If you want to learn
                  them, we are suggesting you to learn them in that order)
                </p>
                <div className="home-missing-characters-scroll">
                  <p className="home-missing-characters-list">
                    {characters.map((character, index) => (
                      <span key={character}>
                        {index > 0 ? "、" : null}
                        <button
                          type="button"
                          className="home-missing-character-button"
                          onClick={() => setSelectedCharacter(character)}
                        >
                          {character}
                        </button>
                      </span>
                    ))}
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-button-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      {selectedCharacter !== null && (
        <div className="modal-overlay" onClick={closeWordsModal}>
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hsk-character-words-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="hsk-character-words-title" className="modal-title">
              {selectedCharacter}
            </h2>
            <div className="character-words-modal-content">
              <p className="character-words-modal-heading">
                Related HSK words (up to level {level}):
              </p>
              {isLoadingWords && <p>Loading words...</p>}
              {wordsError && <p className="table-error">{wordsError}</p>}
              {!isLoadingWords && !wordsError && words.length === 0 && (
                <p>No related HSK words found for this level.</p>
              )}
              {!isLoadingWords && !wordsError && words.length > 0 && (
                <ul className="character-words-modal-list">
                  {words.map((entry) => (
                    <li key={entry.id}>
                      {entry.word}
                      {entry.pinyin ? ` (${entry.pinyin})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button-cancel"
                onClick={closeWordsModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
