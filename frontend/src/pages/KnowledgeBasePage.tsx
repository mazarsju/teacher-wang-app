import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import AddWordModal, { type WordFormValues } from "../components/AddWordModal";
import CharacterFormModal, {
  type CharacterFormValues,
} from "../components/CharacterFormModal";
import CharacterWordsModal from "../components/CharacterWordsModal";
import ConfirmModal from "../components/ConfirmModal";
import { ExportIcon, EyeIcon, ImportIcon, PenIcon, TrashIcon } from "../components/icons";
import Page from "../components/Page";
import PinyinGridView from "../components/PinyinGridView";
import Table, { type TableColumn } from "../components/Table";
import type { Character } from "../types/character";
import type { Word } from "../types/word";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setAnkiStatus } from "../store/slices/ankiSlice";
import {
  removeCharacter,
  upsertCharacter,
} from "../store/slices/charactersSlice";
import { removeWord, upsertWord } from "../store/slices/wordsSlice";
import { syncAppData } from "../store/thunks/syncAppData";
import { runAnkiQuickSync } from "../utils/anki/ankiApi";
import {
  createCharacter,
  deleteCharacter,
  updateCharacter,
} from "../utils/knowledgeBase/charactersApi";
import { formatDateTime } from "../utils/knowledgeBase/formatDateTime";
import { deleteKnowledgeBase, exportDatabase, importDatabase } from "../utils/knowledgeBase/knowledgeBaseApi";
import {
  createWord,
  deleteWord,
  updateWord,
} from "../utils/knowledgeBase/wordsApi";
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

type KnowledgeBaseMode = "view" | "edit";

export default function KnowledgeBasePage() {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.characters.items);
  const words = useAppSelector((state) => state.words.items);
  const ankiStatus = useAppSelector((state) => state.anki.status);
  const syncStatus = useAppSelector((state) => state.sync.status);
  const syncError = useAppSelector((state) => state.sync.error);
  const lastSyncedAt = useAppSelector((state) => state.sync.lastSyncedAt);

  const [pageMode, setPageMode] = useState<KnowledgeBaseMode>("edit");
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
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeletingKnowledgeBaseConfirmOpen, setIsDeletingKnowledgeBaseConfirmOpen] = useState(false);
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [quickSyncError, setQuickSyncError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const hasSyncedData = lastSyncedAt !== null;
  const isLoading =
    !hasSyncedData && (syncStatus === "idle" || syncStatus === "loading");
  const error = mutationError ?? (!hasSyncedData ? syncError : null);
  const ankiOverallSynchronized =
    ankiStatus.synchronization_status === "synchronized";
  const pendingAnkiPushEstimate = ankiStatus.pending_push_estimate;

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

  async function handleOpenConfirmDeleteKnowledgeBase() {
    setIsDeletingKnowledgeBaseConfirmOpen(true);
  }

  async function handleConfirmDeleteKnowledgeBase() {
      setIsDeletingKnowledgeBaseConfirmOpen(false);
      setIsDeleting(true);
      try {
        await deleteKnowledgeBase();
        // TODO dispatch(resetKnowledgeBase());
      } catch (deleteError) {
        setMutationError(deleteError instanceof Error ? deleteError.message : "Failed to delete database.");
      } finally {
        setIsDeleting(false);
      }
  }

  async function handleExportDatabase() {
    setStatusMessage(null);
    setIsExporting(true);

    try {
      await exportDatabase();
      setStatusMessage('The database has been downloaded as a zip file.');
    } catch (exportError) {
      setMutationError(
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
      await dispatch(syncAppData()).unwrap();
      setStatusMessage("The database has been imported successfully.");
    } catch (importError) {
      setMutationError(
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
      await deleteCharacter(character.char);
      dispatch(removeCharacter(character.char));
    } catch (deleteError) {
      setMutationError(
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
      await deleteWord(word.word);
      dispatch(removeWord(word.word));
    } catch (deleteError) {
      setMutationError(
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
      const updatedCharacter = await updateCharacter(character.char, {
        pinyin: values.pinyin,
        writting_known: values.writting_known,
      });
      dispatch(upsertCharacter(updatedCharacter));
    } catch (updateError) {
      setMutationError(
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
      const updatedWord = await updateWord(word.word, {
        definition: values.definition,
      });
      dispatch(upsertWord(updatedWord));
    } catch (updateError) {
      setMutationError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update word.",
      );
    }
  }

  async function confirmAddCharacter(values: CharacterFormValues) {
    closeAddCharacterModal();

    try {
      const createdCharacter = await createCharacter(values);
      dispatch(upsertCharacter(createdCharacter));
    } catch (addError) {
      setMutationError(
        addError instanceof Error ? addError.message : "Failed to add character.",
      );
    }
  }

  async function confirmAddWord(values: WordFormValues) {
    setIsAddWordModalOpen(false);

    try {
      const createdWord = await createWord({
        word: values.word,
        definition: values.definition || null,
      });
      dispatch(upsertWord(createdWord));
    } catch (addWordError) {
      setMutationError(
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
      dispatch(
        setAnkiStatus({
          ...ankiStatus,
          synchronization_status: result.synchronization_status,
          pending_push_estimate: result.pending_push_estimate,
          decks: {
            ...ankiStatus.decks,
            mandarin_vocabulary: result.mandarin_vocabulary.deck,
            mandarin_writting: result.mandarin_writting.deck,
          },
        }),
      );
    } catch (syncErrorValue) {
      setQuickSyncError(
        syncErrorValue instanceof Error
          ? syncErrorValue.message
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
              className="page-mode-button--danger"
              onClick={() => void handleOpenConfirmDeleteKnowledgeBase()}
              disabled={isDeleting}
            >
              <TrashIcon className="chat-modal-clear-icon" />
              Delete
            </button>
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
        isOpen={isDeletingKnowledgeBaseConfirmOpen}
        message="Are you sure you want to delete the knowledge base?"
        danger={true}
        onCancel={() => setIsDeletingKnowledgeBaseConfirmOpen(false)}
        onConfirm={() => void handleConfirmDeleteKnowledgeBase()}
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
