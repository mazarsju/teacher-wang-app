import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import AddSuggestedWordsModal from "../components/AddSuggestedWordsModal";
import AddWordModal, { type WordFormValues } from "../components/AddWordModal";
import Banner from "../components/Banner";
import Button from "../components/Button";
import CharacterStrokeOrderModal from "../components/CharacterStrokeOrderModal";
import CharacterWordsModal from "../components/CharacterWordsModal";
import ConfirmModal from "../components/ConfirmModal";
import {
  CheckIcon,
  CloseIcon,
  EyeIcon,
  ExportIcon,
  ImportIcon,
  MoreIcon,
  PenIcon,
  TableIcon,
} from "../components/icons";
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
import { exportDatabase, importDatabase } from "../utils/knowledgeBase/knowledgeBaseApi";
import { extractMissingCharacterEntries } from "../utils/knowledgeBase/wordCharacters";
import {
  createWord,
  deleteWord,
  updateWord,
  type CharacterSyncResult,
} from "../utils/knowledgeBase/wordsApi";
import { buildWordsByCharacter } from "../utils/knowledgeBase/wordsByCharacter";
import tableStyles from "../components/Table.module.css";
import styles from "./KnowledgeBasePage.module.css";

function getCharacterColumns(t: TFunction): TableColumn<Character>[] {
  return [
    { key: "char", header: t("knowledgeBasePage.tableHeaders.char") },
    { key: "pinyin", header: t("knowledgeBasePage.tableHeaders.pinyin") },
    {
      key: "writing_known",
      header: t("knowledgeBasePage.tableHeaders.writingKnown"),
      render: (row) =>
        row.writing_known ? <CheckIcon className={styles.writingKnownIcon} /> : "-",
    },
  ];
}

function getWordColumns(t: TFunction): TableColumn<Word>[] {
  return [
    { key: "word", header: t("knowledgeBasePage.tableHeaders.word") },
    {
      key: "definition",
      header: t("knowledgeBasePage.tableHeaders.definition"),
      render: (row) => row.definition ?? "",
    },
    {
      key: "pinyin",
      header: t("knowledgeBasePage.tableHeaders.pinyin"),
      render: (row) => row.pinyin ?? "",
    },
    {
      key: "writing_known",
      header: t("knowledgeBasePage.tableHeaders.writingKnown"),
      render: (row) =>
        row.writing_known ? <CheckIcon className={styles.writingKnownIcon} /> : "-",
    },
  ];
}

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

type CharacterViewFilter = "known" | "unknown" | "all";

function filterCharactersForView(
  characters: Character[],
  filter: CharacterViewFilter,
): Character[] {
  if (filter === "all") {
    return characters;
  }

  return characters.filter((character) =>
    filter === "known" ? character.writing_known : !character.writing_known,
  );
}

type KnowledgeBaseMode = "view" | "edit";

const ONBOARDING_WORD_THRESHOLD = 10;

type KnowledgeBasePageProps = { onNavigate?: (page: PageId) => void };

export default function KnowledgeBasePage({ onNavigate }: KnowledgeBasePageProps) {
  const { t } = useTranslation("knowledge-base");
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
  const [characterViewFilter, setCharacterViewFilter] =
    useState<CharacterViewFilter>("all");
  const [selectedCharacter, setSelectedCharacter] = useState<
    { char: string; pinyin: string } | null
  >(null);
  const [characterSearchQuery, setCharacterSearchQuery] = useState("");
  const [strokeOrderChar, setStrokeOrderChar] = useState<string | null>(null);
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
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const characterColumns = useMemo(() => getCharacterColumns(t), [t]);
  const wordColumns = useMemo(() => getWordColumns(t), [t]);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        actionsMenuRef.current !== null &&
        !actionsMenuRef.current.contains(event.target as Node)
      ) {
        setIsActionsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsActionsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isActionsMenuOpen]);

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
    () => filterCharactersForView(characters, characterViewFilter),
    [characters, characterViewFilter],
  );

  const viewModeSubtitle =
    pageMode === "view"
      ? t(`knowledgeBasePage.subtitle.${characterViewFilter}`)
      : undefined;

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
      setStatusMessage(t("knowledgeBasePage.export.success"));
    } catch (exportError) {
      setMutationError(
        exportError instanceof Error
          ? exportError.message
          : t("knowledgeBasePage.export.error"),
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
      setStatusMessage(t("knowledgeBasePage.import.success"));
    } catch (importError) {
      setMutationError(
        importError instanceof Error
          ? importError.message
          : t("knowledgeBasePage.import.error"),
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
          : t("knowledgeBasePage.deleteWord.error"),
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
        custom_fields: values.custom_fields,
      });
      dispatch(upsertWord(updatedWord));
      applyCharacterSyncResult(updatedWord);
    } catch (updateError) {
      setMutationError(
        updateError instanceof Error
          ? updateError.message
          : t("knowledgeBasePage.editWord.error"),
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
        custom_fields: values.custom_fields,
      });
      dispatch(upsertWord(createdWord));
      applyCharacterSyncResult(createdWord);
    } catch (addWordError) {
      setMutationError(
        addWordError instanceof Error
          ? addWordError.message
          : t("knowledgeBasePage.addWord.error"),
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
          : t("knowledgeBasePage.quickSync.error"),
      );
    } finally {
      setIsQuickSyncing(false);
    }
  }

  return (
    <Page
      title={t("knowledgeBasePage.title")}
      subtitle={viewModeSubtitle}
      headerActionInline
      fullWidth={pageMode === "view"}
      headerAction={
        <div className={styles.actionsMenu} ref={actionsMenuRef}>
          <button
            type="button"
            className={styles.actionsMenuTrigger}
            aria-label={t("knowledgeBasePage.actions.moreOptions")}
            aria-haspopup="menu"
            aria-expanded={isActionsMenuOpen}
            onClick={() => setIsActionsMenuOpen((open) => !open)}
          >
            <MoreIcon className={styles.actionsMenuTriggerIcon} />
          </button>
          {isActionsMenuOpen && (
            <div
              className={styles.actionsMenuDropdown}
              role="menu"
              aria-label={t("knowledgeBasePage.actions.moreOptions")}
            >
              {pageMode === "view" ? (
                <>
                  <button
                    type="button"
                    className={styles.actionsMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setCharacterViewFilter("known");
                    }}
                  >
                    <CheckIcon className={styles.actionsMenuItemIcon} />
                    <span>{t("knowledgeBasePage.actions.showWritingKnown")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.actionsMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setCharacterViewFilter("unknown");
                    }}
                  >
                    <CloseIcon className={styles.actionsMenuItemIcon} />
                    <span>{t("knowledgeBasePage.actions.showWritingUnknown")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.actionsMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setCharacterViewFilter("all");
                    }}
                  >
                    <EyeIcon className={styles.actionsMenuItemIcon} />
                    <span>{t("knowledgeBasePage.actions.showAll")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.actionsMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setPageMode("edit");
                    }}
                  >
                    <PenIcon className={styles.actionsMenuItemIcon} />
                    <span>{t("knowledgeBasePage.actions.backToEditMode")}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.actionsMenuItem}
                    role="menuitem"
                    disabled={isExporting}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      void handleExportDatabase();
                    }}
                  >
                    <ExportIcon className={styles.actionsMenuItemIcon} />
                    <span>{t("knowledgeBasePage.actions.export")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.actionsMenuItem}
                    role="menuitem"
                    disabled={isImporting}
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      importInputRef.current?.click();
                    }}
                  >
                    <ImportIcon className={styles.actionsMenuItemIcon} />
                    <span>{t("knowledgeBasePage.actions.import")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.actionsMenuItem}
                    role="menuitem"
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      switchToViewMode();
                    }}
                  >
                    <TableIcon className={styles.actionsMenuItemIcon} />
                    <span>{t("knowledgeBasePage.actions.pinyinTableView")}</span>
                  </button>
                </>
              )}
            </div>
          )}
          {pageMode === "edit" && (
            <input
              ref={importInputRef}
              type="file"
              accept=".txt,text/plain"
              className={styles.knowledgeBaseImportInput}
              onChange={(event) => void handleImportDatabase(event)}
            />
          )}
        </div>
      }
    >
      {showAnkiSyncBanner && (
        <Banner
          type="warning"
          message={t("knowledgeBasePage.ankiSyncBanner.message", {
            count: pendingAnkiPushEstimate,
          })}
          buttonMessage={
            isQuickSyncing
              ? t("knowledgeBasePage.ankiSyncBanner.syncing")
              : t("knowledgeBasePage.ankiSyncBanner.button")
          }
          actionOnButtonClick={() => void handleQuickSynchro()}
          disabled={isQuickSyncing}
        />
      )}
      {pageMode === "edit" &&
        (words.length < ONBOARDING_WORD_THRESHOLD ? (
          <Banner
            type="info"
            message={t("knowledgeBasePage.onboardingBanner.message")}
            buttonMessage={t("knowledgeBasePage.onboardingBanner.buttonMessage")}
            actionOnButtonClick={() => setIsInitWizardOpen(true)}
          />
        ) : (
          <Banner
            type="info"
            message={t("knowledgeBasePage.suggestionBanner.message")}
            buttonMessage={t("knowledgeBasePage.suggestionBanner.buttonMessage")}
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
          {isLoading && <p>{t("knowledgeBasePage.loading")}</p>}
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
        <p className={styles.knowledgeBaseStatusMessage}>{statusMessage}</p>
      )}
      <AddWordModal
        mode="add"
        isOpen={isAddWordModalOpen}
        existingWords={existingWords}
        hskCharacterPinyin={hskCharacterPinyin}
        characterPinyin={characterPinyin}
        customFields={ankiStatus.decks.mandarin_vocabulary.custom_fields}
        onCancel={() => setIsAddWordModalOpen(false)}
        onConfirm={(values) => void confirmAddWord(values)}
      />
      <AddWordModal
        mode="edit"
        isOpen={wordToEdit !== null}
        initialWord={wordToEdit}
        hskCharacterPinyin={hskCharacterPinyin}
        characterPinyin={characterPinyin}
        customFields={ankiStatus.decks.mandarin_vocabulary.custom_fields}
        onCancel={() => setWordToEdit(null)}
        onConfirm={(values) => void confirmEditWord(values)}
      />
      <ConfirmModal
        isOpen={wordToDelete !== null}
        message={
          wordToDelete
            ? t("knowledgeBasePage.deleteWordConfirm.message", {
                word: wordToDelete.word,
              })
            : ""
        }
        onCancel={() => setWordToDelete(null)}
        onConfirm={() => void confirmDeleteWord()}
      />
      {isLoading && <p>{t("knowledgeBasePage.loading")}</p>}
      {error && <p className="table-error">{error}</p>}
      {!isLoading && !error && (
        <>
          <section className={styles.knowledgeBaseSection}>
            <div className={styles.knowledgeBaseSectionHeader}>
              <h2 className={styles.knowledgeBaseSectionTitle}>
                {t("knowledgeBasePage.wordsSection.title")}
              </h2>
              <Button
                kind="confirm"
                variant="page"
                text={t("knowledgeBasePage.wordsSection.addWordButton")}
                onClick={() => setIsAddWordModalOpen(true)}
              />
            </div>
            <label className={styles.searchBar}>
              <span className={styles.searchBarLabel}>
                {t("knowledgeBasePage.search.label")}
              </span>
              <input
                type="search"
                value={wordSearchQuery}
                placeholder={t("knowledgeBasePage.wordsSection.searchPlaceholder")}
                onChange={(event) => setWordSearchQuery(event.target.value)}
              />
            </label>
            <Table
              columns={wordColumns}
              rows={filteredWords}
              compact
              maxVisibleRows={8}
              getRowKey={(row) => row.word}
              emptyMessage={
                words.length === 0
                  ? t("knowledgeBasePage.wordsSection.emptyDatabase")
                  : t("knowledgeBasePage.wordsSection.emptySearch")
              }
              renderRowActions={(row) => (
                <div className={tableStyles.tableRowActions}>
                  <Button
                    kind="confirm"
                    variant="table"
                    text={t("knowledgeBasePage.wordsSection.editButton")}
                    onClick={() => setWordToEdit(row)}
                  />
                  <Button
                    kind="danger"
                    variant="table"
                    text={t("knowledgeBasePage.wordsSection.deleteButton")}
                    onClick={() => setWordToDelete(row)}
                  />
                </div>
              )}
            />
          </section>
          <section className={styles.knowledgeBaseSection}>
            <div className={styles.knowledgeBaseSectionHeader}>
              <h2 className={styles.knowledgeBaseSectionTitle}>
                {t("knowledgeBasePage.charactersSection.title")}
              </h2>
            </div>
            <label className={styles.searchBar}>
              <span className={styles.searchBarLabel}>
                {t("knowledgeBasePage.search.label")}
              </span>
              <input
                type="search"
                value={characterSearchQuery}
                placeholder={t(
                  "knowledgeBasePage.charactersSection.searchPlaceholder",
                )}
                onChange={(event) => setCharacterSearchQuery(event.target.value)}
              />
            </label>
            <Table
              columns={characterColumns}
              rows={filteredCharacters}
              compact
              maxVisibleRows={8}
              getRowKey={(row) => row.char}
              emptyMessage={
                characters.length === 0
                  ? t("knowledgeBasePage.charactersSection.emptyDatabase")
                  : t("knowledgeBasePage.charactersSection.emptySearch")
              }
              onRowClick={(row) => setStrokeOrderChar(row.char)}
            />
          </section>
          <CharacterStrokeOrderModal
            isOpen={strokeOrderChar !== null}
            char={strokeOrderChar}
            onClose={() => setStrokeOrderChar(null)}
          />
        </>
      )}
        </>
      )}
    </Page>
  );
}
