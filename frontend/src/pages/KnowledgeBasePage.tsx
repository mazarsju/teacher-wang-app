import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import AddSuggestedWordsModal from "../components/AddSuggestedWordsModal";
import AddWordModal, { type WordFormValues } from "../components/AddWordModal";
import CharacterWordsModal from "../components/CharacterWordsModal";
import Banner from "../components/Banner";
import ConfirmModal from "../components/ConfirmModal";
import { ExportIcon, EyeIcon, ImportIcon, PenIcon } from "../components/icons";
import KnowledgeBaseInitWizardModal from "../components/KnowledgeBaseInitWizardModal";
import type { PageId } from "../components/Navbar";
import Page from "../components/Page";
import PinyinGridView from "../components/PinyinGridView";
import Table, { type TableColumn } from "../components/Table";
import type { Character } from "../types/character";
import type { Word } from "../types/word";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setAnkiStatus } from "../store/slices/ankiSlice";
import { removeCharacter, upsertCharacter } from "../store/slices/charactersSlice";
import { removeWord, upsertWord } from "../store/slices/wordsSlice";
import { syncAppData } from "../store/thunks/syncAppData";
import { runAnkiQuickSync } from "../utils/anki/ankiApi";
import { bulkCreateCharacters } from "../utils/knowledgeBase/charactersApi";
import { formatDateTime } from "../utils/knowledgeBase/formatDateTime";
import { exportDatabase, importDatabase } from "../utils/knowledgeBase/knowledgeBaseApi";
import { extractMissingCharacterEntries } from "../utils/knowledgeBase/wordCharacters";
import {
  createWord,
  deleteWord,
  updateWord,
  type CharacterSyncResult,
} from "../utils/knowledgeBase/wordsApi";
import { buildWordsByCharacter } from "../utils/knowledgeBase/wordsByCharacter";

const CHARACTER_COLUMNS: TableColumn<Character>[] = [
  { key: "char", header: "char" },
  { key: "pinyin", header: "pinyin" },
  {
    key: "writing_known",
    header: "writing_known",
    render: (row) => String(row.writing_known),
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
    key: "pinyin",
    header: "pinyin",
    render: (row) => row.pinyin ?? "",
  },
  {
    key: "writing_known",
    header: "writing_known",
    render: (row) => String(row.writing_known),
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
    character.writing_known ? showWritingKnown : showWritingUnknown,
  );
}

type KnowledgeBaseMode = "view" | "edit";

const ONBOARDING_WORD_THRESHOLD = 10;

type KnowledgeBasePageProps = { onNavigate?: (page: PageId) => void };

export default function KnowledgeBasePage({ onNavigate }: KnowledgeBasePageProps) {
  const dispatch = useAppDispatch();
  const characters = useAppSelector((state) => state.characters.items);
  const words = useAppSelector((state) => state.words.items);
  const hskCharacterPinyin = useAppSelector(
    (state) => state.hskCharacters.pinyinByCharacter,
  );
  const ankiStatus = useAppSelector((state) => state.anki.status);
  const syncStatus = useAppSelector((state) => state.sync.status);
  const syncError = useAppSelector((state) => state.sync.error);
  const lastSyncedAt = useAppSelector((state) => state.sync.lastSyncedAt);

  const [pageMode, setPageMode] = useState<KnowledgeBaseMode>("edit");
  const [showWritingKnown, setShowWritingKnown] = useState(true);
  const [showWritingUnknown, setShowWritingUnknown] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<
    { char: string; pinyin: string } | null
  >(null);
  const [characterSearchQuery, setCharacterSearchQuery] = useState("");
  const [wordSearchQuery, setWordSearchQuery] = useState("");
  const [wordToDelete, setWordToDelete] = useState<Word | null>(null);
  const [wordToEdit, setWordToEdit] = useState<Word | null>(null);
  const [isAddWordModalOpen, setIsAddWordModalOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);
  const [quickSyncError, setQuickSyncError] = useState<string | null>(null);
  const [isInitWizardOpen, setIsInitWizardOpen] = useState(false);
  const [isSuggestedWordsModalOpen, setIsSuggestedWordsModalOpen] = useState(false);
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

  const characterPinyin = useMemo(
    () =>
      Object.fromEntries(
        characters.map((character) => [character.char, character.pinyin]),
      ),
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
      : (wordsByCharacter
          .get(selectedCharacter.char)
          ?.get(selectedCharacter.pinyin) ?? []);

  const showAnkiSyncBanner =
    ankiOverallSynchronized && pendingAnkiPushEstimate > 0;

  const switchToViewMode = useCallback(() => {
    setPageMode("view");
    setWordToDelete(null);
    setWordToEdit(null);
    setIsAddWordModalOpen(false);
    setStatusMessage(null);
  }, []);

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

  function applyCharacterSyncResult(result: CharacterSyncResult) {
    result.updated_characters.forEach((character) =>
      dispatch(upsertCharacter(character)),
    );
    result.deleted_char_ids.forEach((char) => dispatch(removeCharacter(char)));
  }

  async function confirmDeleteWord() {
    if (wordToDelete === null) {
      return;
    }

    const word = wordToDelete;
    setWordToDelete(null);

    try {
      const syncResult = await deleteWord(word.word);
      dispatch(removeWord(word.word));
      applyCharacterSyncResult(syncResult);
    } catch (deleteError) {
      setMutationError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete word.",
      );
    }
  }

  // Auto-creates any Chinese character from `word` that isn't in the
  // database yet, using each character's resolved pinyin syllable (already
  // validated by the time a word form can be submitted — see
  // extractMissingCharacterEntries / AddWordModal's isWordPinyinValid check).
  async function ensureCharactersExist(word: string, pinyin: string) {
    const missingEntries = extractMissingCharacterEntries(
      word,
      pinyin,
      new Set(knownCharacters),
    );
    if (missingEntries.length === 0) {
      return;
    }

    const createdCharacters = await bulkCreateCharacters(missingEntries);
    createdCharacters.forEach((character) => dispatch(upsertCharacter(character)));
  }

  async function confirmEditWord(values: WordFormValues) {
    if (wordToEdit === null) {
      return;
    }

    const word = wordToEdit;
    setWordToEdit(null);

    try {
      await ensureCharactersExist(values.word, values.pinyin);
      const updatedWord = await updateWord(word.word, {
        definition: values.definition,
        pinyin: values.pinyin || null,
        writing_known: values.writing_known,
      });
      dispatch(upsertWord(updatedWord));
      applyCharacterSyncResult(updatedWord);
    } catch (updateError) {
      setMutationError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update word.",
      );
    }
  }

  async function confirmAddWord(values: WordFormValues) {
    setIsAddWordModalOpen(false);

    try {
      await ensureCharactersExist(values.word, values.pinyin);
      const createdWord = await createWord({
        word: values.word,
        definition: values.definition || null,
        pinyin: values.pinyin || null,
        writing_known: values.writing_known,
      });
      dispatch(upsertWord(createdWord));
      applyCharacterSyncResult(createdWord);
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
            mandarin_writing: result.mandarin_writing.deck,
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

  return (
    <Page
      title="Knowledge base"
      fullWidth={pageMode === "view"}
      headerCenter={
        pageMode === "view" ? (
          <div className="page-header-toggles">
            <label className="page-header-toggle">
              <span className="page-header-toggle-label">Writing known</span>
              <span className="toggle">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Writing known"
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
                Writing not known
              </span>
              <span className="toggle">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Writing not known"
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
      {showAnkiSyncBanner && (
        <Banner
          type="warning"
          message={`${pendingAnkiPushEstimate} card${pendingAnkiPushEstimate === 1 ? "" : "s"} need to be added in Anki for synchronization.`}
          buttonMessage={isQuickSyncing ? "Syncing..." : "Quick synchro"}
          actionOnButtonClick={() => void handleQuickSynchro()}
          disabled={isQuickSyncing}
        />
      )}
      {pageMode === "edit" &&
        (words.length < ONBOARDING_WORD_THRESHOLD ? (
          <Banner
            type="info"
            message="Struggling with setting up your knowledge base? Click here for a faster and easier onboarding!"
            buttonMessage="Start building your knowledge base"
            actionOnButtonClick={() => setIsInitWizardOpen(true)}
          />
        ) : (
          <Banner
            type="info"
            message="Need some inspiration for your next word to learn?"
            buttonMessage="Add next word"
            actionOnButtonClick={() => setIsSuggestedWordsModalOpen(true)}
          />
        ))}
      <KnowledgeBaseInitWizardModal
        isOpen={isInitWizardOpen}
        onClose={() => setIsInitWizardOpen(false)}
        onNavigate={onNavigate}
      />
      <AddSuggestedWordsModal
        isOpen={isSuggestedWordsModalOpen}
        onClose={() => setIsSuggestedWordsModalOpen(false)}
      />
      {quickSyncError && <p className="table-error">{quickSyncError}</p>}
      {pageMode === "view" && (
        <>
          <CharacterWordsModal
            isOpen={selectedCharacter !== null}
            character={
              selectedCharacter &&
              `${selectedCharacter.char} (${selectedCharacter.pinyin})`
            }
            words={selectedCharacterWords}
            onClose={() => setSelectedCharacter(null)}
          />
          {isLoading && <p>Loading knowledge base...</p>}
          {error && <p className="table-error">{error}</p>}
          {!isLoading && !error && (
            <PinyinGridView
              characters={viewModeCharacters}
              characterHasWords={(char, pinyin) =>
                (wordsByCharacter.get(char)?.get(pinyin)?.length ?? 0) > 0
              }
              onCharacterClick={(char, pinyin) =>
                setSelectedCharacter({ char, pinyin })
              }
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
        existingWords={existingWords}
        hskCharacterPinyin={hskCharacterPinyin}
        characterPinyin={characterPinyin}
        onCancel={() => setIsAddWordModalOpen(false)}
        onConfirm={(values) => void confirmAddWord(values)}
      />
      <AddWordModal
        mode="edit"
        isOpen={wordToEdit !== null}
        initialWord={wordToEdit}
        hskCharacterPinyin={hskCharacterPinyin}
        characterPinyin={characterPinyin}
        onCancel={() => setWordToEdit(null)}
        onConfirm={(values) => void confirmEditWord(values)}
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
            />
          </section>
        </>
      )}
        </>
      )}
    </Page>
  );
}
