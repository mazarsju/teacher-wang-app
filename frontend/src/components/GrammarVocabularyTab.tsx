import { useState } from "react";
import { useTranslation } from "react-i18next";
import AddWordModal, { type WordFormValues } from "./AddWordModal";
import Button from "./Button";
import { CheckIcon } from "./icons";
import Table, { type TableColumn } from "./Table";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { removeCharacter, upsertCharacter } from "../store/slices/charactersSlice";
import { upsertWord } from "../store/slices/wordsSlice";
import type { HskWord } from "../types/hskWord";
import type { Word } from "../types/word";
import { bulkCreateCharacters } from "../utils/knowledgeBase/charactersApi";
import { extractMissingCharacterEntries } from "../utils/knowledgeBase/wordCharacters";
import { createWord } from "../utils/knowledgeBase/wordsApi";
import kbInitWizardStyles from "./KnowledgeBaseInitWizardModal.module.css";
import styles from "./GrammarVocabularyTab.module.css";

type GrammarVocabularyTabProps = {
  words: HskWord[];
};

export default function GrammarVocabularyTab({ words }: GrammarVocabularyTabProps) {
  const { t } = useTranslation("grammar");
  const dispatch = useAppDispatch();
  const knownWords = useAppSelector((state) => state.words.items);
  const knownCharacters = useAppSelector((state) => state.characters.items);
  const hskCharacterPinyin = useAppSelector(
    (state) => state.hskCharacters.pinyinByCharacter,
  );
  const ankiStatus = useAppSelector((state) => state.anki.status);

  const [wordToAdd, setWordToAdd] = useState<HskWord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingWordSet = new Set(knownWords.map((word) => word.word));
  const characterPinyin = Object.fromEntries(
    knownCharacters.map((character) => [character.char, character.pinyin]),
  );

  async function ensureCharactersExist(word: string, pinyin: string) {
    const missingEntries = extractMissingCharacterEntries(
      word,
      pinyin,
      new Set(knownCharacters.map((character) => character.char)),
    );
    if (missingEntries.length === 0) {
      return;
    }

    const createdCharacters = await bulkCreateCharacters(missingEntries);
    createdCharacters.forEach((character) => dispatch(upsertCharacter(character)));
  }

  async function handleConfirmAdd(values: WordFormValues) {
    setWordToAdd(null);
    setError(null);

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
      createdWord.updated_characters.forEach((character) =>
        dispatch(upsertCharacter(character)),
      );
      createdWord.deleted_char_ids.forEach((char) => dispatch(removeCharacter(char)));
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : t("grammarVocabularyTab.addError"),
      );
    }
  }

  const columns: TableColumn<HskWord>[] = [
    {
      key: "id",
      header: "",
      render: (row) =>
        existingWordSet.has(row.word) ? (
          <CheckIcon className={styles.grammarVocabAddedIcon} />
        ) : null,
    },
    {
      key: "word",
      header: t("grammarVocabularyTab.table.word"),
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

  const prefillWord: Word | null = wordToAdd
    ? {
        word: wordToAdd.word,
        definition: wordToAdd.definition,
        pinyin: wordToAdd.pinyin,
        writing_known: false,
        custom_fields: {},
        updated_at: "",
        characters: [],
      }
    : null;

  return (
    <div>
      {error && <p className="table-error">{error}</p>}
      <Table
        columns={columns}
        rows={words}
        compact
        getRowKey={(row) => row.id}
        emptyMessage={t("grammarVocabularyTab.empty")}
        renderRowActions={(row) =>
          existingWordSet.has(row.word) ? null : (
            <Button
              kind="confirm"
              variant="table"
              text={t("grammarVocabularyTab.addButton")}
              onClick={() => setWordToAdd(row)}
            />
          )
        }
      />
      <AddWordModal
        mode="add"
        isOpen={wordToAdd !== null}
        initialWord={prefillWord}
        existingWords={knownWords.map((word) => word.word)}
        hskCharacterPinyin={hskCharacterPinyin}
        characterPinyin={characterPinyin}
        customFields={ankiStatus.decks.mandarin_vocabulary.custom_fields}
        onCancel={() => setWordToAdd(null)}
        onConfirm={(values) => void handleConfirmAdd(values)}
      />
    </div>
  );
}
