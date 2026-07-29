import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import AddWordModal, { type WordFormValues } from "../components/AddWordModal";
import CharacterFormModal, {
  type CharacterFormValues,
} from "../components/CharacterFormModal";
import CharacterWordsModal from "../components/CharacterWordsModal";
import ConfirmModal from "../components/ConfirmModal";
import { ExportIcon, EyeIcon, ImportIcon, PenIcon } from "../components/icons";
import Page from "../components/Page";
import PinyinGridView from "../components/PinyinGridView";
import Table, { type TableColumn } from "../components/Table";
import type { Character } from "../types/character";
import type { Word } from "../types/word";
import { fetchAnkiStatus, runAnkiQuickSync } from "../utils/anki/ankiApi";
import { API_BASE } from "../utils/apiBase";
import { formatDateTime } from "../utils/knowledgeBase/formatDateTime";
import { exportDatabase, importDatabase } from "../utils/knowledgeBase/knowledgeBaseApi";
import { buildWordsByCharacter } from "../utils/knowledgeBase/wordsByCharacter";

const CHARACTER_COLUMNS: TableColumn<Character>[] = [
  { key: "char", header: "char" },
  { key: "pinyin", header: "pinyin" },
  {
    key: "writting_known",
    header: "writting_known",
    render: (row) => String(row.writting_known),
  },
  {
    key: "updated_at",
    header: "updated_at",
    render: (row) => formatDateTime(row.updated_at),
  },
];

const WORD_COLUMNS: TableColumn<Word>[] = [
  { key: "word", header: "words" },
  {
    key: "definition",
    header: "definition",
    render: (row) => row.definition ?? "",
  },
  {
    key: "updated_at",
    header: "updated_at",
    render: (row) => formatDateTime(row.updated_at),
  },
];

function filterCharacters(characters: Character[], searchQuery: string) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return characters;
  }

  return characters.filter(
    (character) =>
      character.char.toLowerCase().includes(query) ||
      character.pinyin.toLowerCase().includes(query),
  );
}

function filterWords(words: Word[], searchQuery: string) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return words;
  }

  return words.filter(
    (word) =>
      word.word.toLowerCase().includes(query) ||
      (word.definition ?? "").toLowerCase().includes(query),
  );
}

function filterCharactersForView(
  characters: Character[],
  showWritingKnown: boolean,
  showWritingUnknown: boolean,
): Character[] {
  return characters.filter((character) =>
    character.writting_known ? showWritingKnown : showWritingUnknown,
  );
}

async function fetchCharacters(limit?: number) {
  const query = limit == null ? "" : `?limit=${limit}`;
  const response = await fetch(`${API_BASE}/characters${query}`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load characters.");
  }

  return (await response.json()) as Character[];
}

async function fetchWords(limit?: number) {
  const query = limit == null ? "" : `?limit=${limit}`;
  const response = await fetch(`${API_BASE}/words${query}`, { method: "GET" });

  if (!response.ok) {
    throw new Error("Failed to load words.");
  }

  return (await response.json()) as Word[];
}

const INITIAL_PREVIEW_LIMIT = 10;

type KnowledgeBaseMode = "view" | "edit";

export default function KnowledgeBasePage() {
  const [pageMode, setPageMode] = useState<KnowledgeBaseMode>("edit");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [showWritingKnown, setShowWritingKnown] = useState(true);
  const [showWritingUnknown, setShowWritingUnknown] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [characterSearchQuery, setCharacterSearchQuery] = useState("");
  const [wordSearchQuery, setWordSearchQuery] = useState("");
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(
    null,
  );
  const [characterToEdit, setCharacterToEdit] = useState<Character | null>(null);
  const [wordToDelete, setWordToDelete] = useState<Word | null>(null);
  const [wordToEdit, setWordToEdit] = useState<Word | null>(null);
  const [isAddCharacterModalOpen, setIsAddCharacterModalOpen] = useState(false);
  const [isAddWordModalOpen, setIsAddWordModalOpen] = useState(false);
  const [prefilledCharForAdd, setPrefilledCharForAdd] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [ankiOverallSynchronized, setAnkiOverallSynchronized] = useState(false);
  const [pendingAnkiPushEstimate, setPendingAnkiPushEstimate] = useState(0);
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [quickSyncError, setQuickSyncError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const loadGenerationRef = useRef(0);

  const knownCharacters = useMemo(
    () => characters.map((character) => character.char),
    [characters],
  );

  const existingWords = useMemo(
    () => words.map((word) => word.word),
    [words],
  );

  const filteredCharacters = useMemo(
    () => filterCharacters(characters, characterSearchQuery),
    [characters, characterSearchQuery],
  );

  const filteredWords = useMemo(
    () => filterWords(words, wordSearchQuery),
    [words, wordSearchQuery],
  );

  const viewModeCharacters = useMemo(
    () =>
      filterCharactersForView(
        characters,
        showWritingKnown,
        showWritingUnknown,
      ),
    [characters, showWritingKnown, showWritingUnknown],
  );

  const wordsByCharacter = useMemo(
    () => buildWordsByCharacter(words),
    [words],
  );

  const selectedCharacterWords =
    selectedCharacter === null
      ? []
      : (wordsByCharacter.get(selectedCharacter) ?? []);

  const showAnkiSyncBanner =
    ankiOverallSynchronized && pendingAnkiPushEstimate > 0;

  const refreshAnkiSyncBanner = useCallback(async () => {
    try {
      const status = await fetchAnkiStatus();
      setAnkiOverallSynchronized(status.synchronization_status === "synchronized");
      setPendingAnkiPushEstimate(status.pending_push_estimate);
    } catch {
      // Banner is optional; keep the knowledge base usable if Anki status fails.
    }
  }, []);

  const loadKnowledgeBase = useCallback(
    async (options?: { progressive?: boolean }) => {
      const generation = ++loadGenerationRef.current;
      setError(null);

      try {
        if (options?.progressive) {
          const [previewCharacters, previewWords] = await Promise.all([
            fetchCharacters(INITIAL_PREVIEW_LIMIT),
            fetchWords(INITIAL_PREVIEW_LIMIT),
          ]);
          if (generation !== loadGenerationRef.current) {
            return;
          }
          setCharacters(previewCharacters);
          setWords(previewWords);
          setIsLoading(false);
          void refreshAnkiSyncBanner();

          const [charactersData, wordsData] = await Promise.all([
            fetchCharacters(),
            fetchWords(),
          ]);
          if (generation !== loadGenerationRef.current) {
            return;
          }
          setCharacters(charactersData);
          setWords(wordsData);
          return;
        }

        const [charactersData, wordsData] = await Promise.all([
          fetchCharacters(),
          fetchWords(),
        ]);
        if (generation !== loadGenerationRef.current) {
          return;
        }
        setCharacters(charactersData);
        setWords(wordsData);
        await refreshAnkiSyncBanner();
      } catch (loadError) {
        if (generation !== loadGenerationRef.current) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load knowledge base.",
        );
      } finally {
        if (generation === loadGenerationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [refreshAnkiSyncBanner],
  );

  useEffect(() => {
    void loadKnowledgeBase({ progressive: true });
  }, [loadKnowledgeBase]);

  const openAddCharacterModal = useCallback((prefilledChar = "") => {
    setPrefilledCharForAdd(prefilledChar);
    setIsAddCharacterModalOpen(true);
  }, []);

  const closeAddCharacterModal = useCallback(() => {
    setIsAddCharacterModalOpen(false);
    setPrefilledCharForAdd("");
  }, []);

  const switchToViewMode = useCallback(() => {
    setPageMode("view");
    setCharacterToDelete(null);
    setCharacterToEdit(null);
    setWordToDelete(null);
    setWordToEdit(null);
    setIsAddCharacterModalOpen(false);
    setIsAddWordModalOpen(false);
    setPrefilledCharForAdd("");
    setStatusMessage(null);
  }, []);

  async function handleExportDatabase() {
    setStatusMessage(null);
    setIsExporting(true);

    try {
      await exportDatabase();
      setStatusMessage('The database has been saved in the "db.txt" file.');
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Failed to export database.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImportDatabase(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setStatusMessage(null);
    setIsImporting(true);

    try {
      await importDatabase(file);
      await loadKnowledgeBase();
      setStatusMessage("The database has been imported successfully.");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import database.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function confirmDeleteCharacter() {
    if (characterToDelete === null) {
      return;
    }

    const character = characterToDelete;
    setCharacterToDelete(null);

    try {
      const response = await fetch(
        `${API_BASE}/characters/${encodeURIComponent(character.char)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete character.");
      }

      setCharacters((currentCharacters) =>
        currentCharacters.filter((item) => item.char !== character.char),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete character.",
      );
    }
  }

  async function confirmDeleteWord() {
    if (wordToDelete === null) {
      return;
    }

    const word = wordToDelete;
    setWordToDelete(null);

    try {
      const response = await fetch(
        `${API_BASE}/words/${encodeURIComponent(word.word)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Failed to delete word.");
      }

      setWords((currentWords) =>
        currentWords.filter((item) => item.word !== word.word),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete word.",
      );
    }
  }

  async function confirmEditCharacter(values: CharacterFormValues) {
    if (characterToEdit === null) {
      return;
    }

    const character = characterToEdit;
    setCharacterToEdit(null);

    try {
      const response = await fetch(
        `${API_BASE}/characters/${encodeURIComponent(character.char)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pinyin: values.pinyin,
            writting_known: values.writting_known,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to update character.");
      }

      const updatedCharacter = (await response.json()) as Character;
      setCharacters((currentCharacters) =>
        currentCharacters.map((item) =>
          item.char === updatedCharacter.char ? updatedCharacter : item,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update character.",
      );
    }
  }

  async function confirmEditWord(values: WordFormValues) {
    if (wordToEdit === null) {
      return;
    }

    const word = wordToEdit;
    setWordToEdit(null);

    try {
      const response = await fetch(
        `${API_BASE}/words/${encodeURIComponent(word.word)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            definition: values.definition,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to update word.");
      }

      const updatedWord = (await response.json()) as Word;
      setWords((currentWords) =>
        currentWords.map((item) =>
          item.word === updatedWord.word ? updatedWord : item,
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update word.",
      );
    }
  }

  async function confirmAddCharacter(values: CharacterFormValues) {
    closeAddCharacterModal();

    try {
      const response = await fetch(`${API_BASE}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to add character.");
      }

      await loadKnowledgeBase();
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "Failed to add character.",
      );
    }
  }

  async function confirmAddWord(values: WordFormValues) {
    setIsAddWordModalOpen(false);

    try {
      const response = await fetch(`${API_BASE}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: values.word,
          definition: values.definition || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add word.");
      }

      const createdWord = (await response.json()) as Word;
      setWords((currentWords) =>
        [...currentWords, createdWord].sort((left, right) =>
          left.word.localeCompare(right.word),
        ),
      );
      await refreshAnkiSyncBanner();
    } catch (addWordError) {
      setError(
        addWordError instanceof Error
          ? addWordError.message
          : "Failed to add word.",
      );
    }
  }

  async function handleQuickSynchro() {
    setQuickSyncError(null);
    setIsQuickSyncing(true);
    try {
      const result = await runAnkiQuickSync();
      setAnkiOverallSynchronized(
        result.synchronization_status === "synchronized",
      );
      setPendingAnkiPushEstimate(result.pending_push_estimate);
    } catch (syncError) {
      setQuickSyncError(
        syncError instanceof Error
          ? syncError.message
          : "Failed to quick-synchronize with Anki.",
      );
    } finally {
      setIsQuickSyncing(false);
    }
  }

  const ankiSyncBanner = showAnkiSyncBanner ? (
    <div className="anki-sync-banner" role="status">
      <p className="anki-sync-banner-text">
        {pendingAnkiPushEstimate} card
        {pendingAnkiPushEstimate === 1 ? "" : "s"} need to be added in Anki for
        synchronization.
      </p>
      <button
        type="button"
        className="anki-sync-banner-button"
        onClick={() => void handleQuickSynchro()}
        disabled={isQuickSyncing}
      >
        {isQuickSyncing ? "Syncing..." : "Quick synchro"}
      </button>
    </div>
  ) : null;

  return (
    <>
      {ankiSyncBanner}
      <Page
      title="Knowledge base"
      fullWidth={pageMode === "view"}
      headerCenter={
        pageMode === "view" ? (
          <div className="page-header-toggles">
            <label className="page-header-toggle">
              <span className="page-header-toggle-label">Writting known</span>
              <span className="toggle">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Writting known"
                  checked={showWritingKnown}
                  onChange={(event) =>
                    setShowWritingKnown(event.target.checked)
                  }
                />
                <span className="toggle-slider" />
              </span>
            </label>
            <label className="page-header-toggle">
              <span className="page-header-toggle-label">
                Writting not known
              </span>
              <span className="toggle">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Writting not known"
                  checked={showWritingUnknown}
                  onChange={(event) =>
                    setShowWritingUnknown(event.target.checked)
                  }
                />
                <span className="toggle-slider" />
              </span>
            </label>
          </div>
        ) : undefined
      }
      headerAction={
        pageMode === "view" ? (
          <button
            type="button"
            className="page-mode-button"
            onClick={() => setPageMode("edit")}
          >
            <PenIcon className="page-mode-button-icon" />
            Modify
          </button>
        ) : (
          <div className="page-header-actions">
            <button
              type="button"
              className="page-mode-button"
              onClick={() => void handleExportDatabase()}
              disabled={isExporting}
            >
              <ExportIcon className="page-mode-button-icon" />
              Export
            </button>
            <button
              type="button"
              className="page-mode-button"
              onClick={() => importInputRef.current?.click()}
              disabled={isImporting}
            >
              <ImportIcon className="page-mode-button-icon" />
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".txt,text/plain"
              className="knowledge-base-import-input"
              onChange={(event) => void handleImportDatabase(event)}
            />
            <button
              type="button"
              className="page-mode-button"
              onClick={switchToViewMode}
            >
              <EyeIcon className="page-mode-button-icon" />
              View
            </button>
          </div>
        )
      }
    >
      {quickSyncError && <p className="table-error">{quickSyncError}</p>}
      {pageMode === "view" && (
        <>
          <CharacterWordsModal
            isOpen={selectedCharacter !== null}
            character={selectedCharacter}
            words={selectedCharacterWords}
            onClose={() => setSelectedCharacter(null)}
          />
          {isLoading && <p>Loading knowledge base...</p>}
          {error && <p className="table-error">{error}</p>}
          {!isLoading && !error && (
            <PinyinGridView
              characters={viewModeCharacters}
              characterHasWords={(char) =>
                (wordsByCharacter.get(char)?.length ?? 0) > 0
              }
              onCharacterClick={setSelectedCharacter}
            />
          )}
        </>
      )}
      {pageMode === "edit" && (
        <>
      {statusMessage && (
        <p className="knowledge-base-status-message">{statusMessage}</p>
      )}
      <AddWordModal
        mode="add"
        isOpen={isAddWordModalOpen}
        knownCharacters={knownCharacters}
        existingWords={existingWords}
        onCancel={() => setIsAddWordModalOpen(false)}
        onConfirm={(values) => void confirmAddWord(values)}
        onAddCharacter={openAddCharacterModal}
      />
      <AddWordModal
        mode="edit"
        isOpen={wordToEdit !== null}
        initialWord={wordToEdit}
        knownCharacters={knownCharacters}
        onCancel={() => setWordToEdit(null)}
        onConfirm={(values) => void confirmEditWord(values)}
        onAddCharacter={openAddCharacterModal}
      />
      <CharacterFormModal
        mode="add"
        isOpen={isAddCharacterModalOpen}
        prefilledChar={prefilledCharForAdd}
        existingCharacters={knownCharacters}
        onCancel={closeAddCharacterModal}
        onConfirm={(values) => void confirmAddCharacter(values)}
      />
      <CharacterFormModal
        mode="edit"
        isOpen={characterToEdit !== null}
        initialCharacter={characterToEdit}
        onCancel={() => setCharacterToEdit(null)}
        onConfirm={(values) => void confirmEditCharacter(values)}
      />
      <ConfirmModal
        isOpen={characterToDelete !== null}
        message={
          characterToDelete
            ? `Are you sure you want to delete "${characterToDelete.char}"?`
            : ""
        }
        onCancel={() => setCharacterToDelete(null)}
        onConfirm={() => void confirmDeleteCharacter()}
      />
      <ConfirmModal
        isOpen={wordToDelete !== null}
        message={
          wordToDelete
            ? `Are you sure you want to delete "${wordToDelete.word}"?`
            : ""
        }
        onCancel={() => setWordToDelete(null)}
        onConfirm={() => void confirmDeleteWord()}
      />
      {isLoading && <p>Loading knowledge base...</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && (
        <>
          <section className="knowledge-base-section">
            <div className="knowledge-base-section-header">
              <h2 className="knowledge-base-section-title">Words</h2>
              <button
                type="button"
                className="page-add-button"
                onClick={() => setIsAddWordModalOpen(true)}
              >
                Add word
              </button>
            </div>
            <label className="search-bar">
              <span className="search-bar-label">Search</span>
              <input
                type="search"
                value={wordSearchQuery}
                placeholder="Search words..."
                onChange={(event) => setWordSearchQuery(event.target.value)}
              />
            </label>
            <Table
              columns={WORD_COLUMNS}
              rows={filteredWords}
              compact
              maxVisibleRows={5}
              getRowKey={(row) => row.word}
              emptyMessage={
                words.length === 0
                  ? "No words in the database yet."
                  : "No words match your search."
              }
              renderRowActions={(row) => (
                <div className="table-row-actions">
                  <button
                    type="button"
                    className="table-edit-button"
                    onClick={() => setWordToEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="table-delete-button"
                    onClick={() => setWordToDelete(row)}
                  >
                    Delete
                  </button>
                </div>
              )}
            />
          </section>
          <section className="knowledge-base-section">
            <div className="knowledge-base-section-header">
              <h2 className="knowledge-base-section-title">Characters</h2>
              <button
                type="button"
                className="page-add-button"
                onClick={() => openAddCharacterModal()}
              >
                Add character
              </button>
            </div>
            <label className="search-bar">
              <span className="search-bar-label">Search</span>
              <input
                type="search"
                value={characterSearchQuery}
                placeholder="Search characters..."
                onChange={(event) => setCharacterSearchQuery(event.target.value)}
              />
            </label>
            <Table
              columns={CHARACTER_COLUMNS}
              rows={filteredCharacters}
              compact
              maxVisibleRows={5}
              getRowKey={(row) => row.char}
              emptyMessage={
                characters.length === 0
                  ? "No characters in the database yet."
                  : "No characters match your search."
              }
              renderRowActions={(row) => (
                <div className="table-row-actions">
                  <button
                    type="button"
                    className="table-edit-button"
                    onClick={() => setCharacterToEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="table-delete-button"
                    onClick={() => setCharacterToDelete(row)}
                  >
                    Delete
                  </button>
                </div>
              )}
            />
          </section>
        </>
      )}
        </>
      )}
    </Page>
    </>
  );
}
