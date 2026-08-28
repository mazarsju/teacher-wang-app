import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE } from "../utils/apiBase";
import { apiFetch } from "../utils/auth/apiFetch";
import Button from "./Button";
import characterWordsStyles from "./CharacterWordsModal.module.css";
import styles from "./MissingHskCharactersModal.module.css";

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
  loadWordsError: string,
): Promise<HskWordEntry[]> {
  const response = await apiFetch(
    `${API_BASE}/hsk-characters/${encodeURIComponent(character)}/words?level=${level}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(loadWordsError);
  }

  return (await response.json()) as HskWordEntry[];
}

export default function MissingHskCharactersModal({
  isOpen,
  level,
  characters,
  onClose,
}: MissingHskCharactersModalProps) {
  const { t } = useTranslation(["home", "common"]);
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

    const loadWordsError = t("missingHskCharactersModal.loadWordsError");
    void fetchHskCharacterWords(selectedCharacter, level, loadWordsError)
      .then((loadedWords) => {
        if (isMounted) {
          setWords(loadedWords);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setWordsError(error instanceof Error ? error.message : loadWordsError);
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
  }, [selectedCharacter, level, t]);

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
            {t("missingHskCharactersModal.title", { level })}
          </h2>
          <div className={characterWordsStyles.characterWordsModalContent}>
            {characters.length === 0 ? (
              <p className={characterWordsStyles.characterWordsModalHeading}>
                {t("missingHskCharactersModal.empty")}
              </p>
            ) : (
              <>
                <p className={styles.homeMissingCharactersHint}>
                  {t("missingHskCharactersModal.orderHint")}
                </p>
                <div className={styles.homeMissingCharactersScroll}>
                  <p className={styles.homeMissingCharactersList}>
                    {characters.map((character, index) => (
                      <span key={character}>
                        {index > 0 ? "、" : null}
                        <button
                          type="button"
                          className={styles.homeMissingCharacterButton}
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
            <Button kind="cancel" text={t("common:actions.close")} onClick={onClose} />
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
            <div className={characterWordsStyles.characterWordsModalContent}>
              <p className={characterWordsStyles.characterWordsModalHeading}>
                {t("missingHskCharactersModal.relatedWordsHeading", { level })}
              </p>
              {isLoadingWords && <p>{t("missingHskCharactersModal.loadingWords")}</p>}
              {wordsError && <p className="table-error">{wordsError}</p>}
              {!isLoadingWords && !wordsError && words.length === 0 && (
                <p>{t("missingHskCharactersModal.noRelatedWords")}</p>
              )}
              {!isLoadingWords && !wordsError && words.length > 0 && (
                <ul className={characterWordsStyles.characterWordsModalList}>
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
              <Button kind="cancel" text={t("common:actions.close")} onClick={closeWordsModal} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
