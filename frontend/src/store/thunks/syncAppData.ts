import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { emptyAnkiStatus, type AnkiStatus } from "../../types/anki";
import type { Character } from "../../types/character";
import type { GrammarPoint } from "../../types/grammarPoint";
import type { ListeningPracticesResult } from "../../types/listeningPractice";
import type { Word } from "../../types/word";
import type { WritingTopic } from "../../types/writingTopic";
import { fetchAnkiStatus } from "../../utils/anki/ankiApi";
import { fetchGrammarPoints } from "../../utils/grammar/grammarPointsApi";
import { fetchCharacters } from "../../utils/knowledgeBase/charactersApi";
import { fetchHskCharacters } from "../../utils/knowledgeBase/hskCharactersApi";
import {
  fetchHskLevelStatus,
  type HskLevelStatus,
} from "../../utils/knowledgeBase/hskLevelApi";
import { fetchWords } from "../../utils/knowledgeBase/wordsApi";
import {
  fetchListeningPractices,
  refreshListeningPractices,
} from "../../utils/listening/listeningApi";

export type SyncedAppData = {
  characters: Character[];
  words: Word[];
  hskLevel: HskLevelStatus;
  hskCharacterPinyin: Record<string, string>;
  ankiStatus: AnkiStatus;
  grammarPoints: GrammarPoint[];
  writingPractices: WritingTopic[];
  listeningPractices: ListeningPracticesResult;
};

export const resetAppData = createAction("appData/reset");

export const resetKnowledgeBaseData = createAction("knowledgeBaseData/reset");

export const syncAppData = createAsyncThunk<SyncedAppData, void, { state: RootState }>(
  "appData/sync",
  async (): Promise<SyncedAppData> => {
    const [characters, words, hskLevel, hskCharacters, grammar, listeningPractices] =
      await Promise.all([
        fetchCharacters(),
        fetchWords(),
        fetchHskLevelStatus(),
        fetchHskCharacters(),
        fetchGrammarPoints(),
        refreshListeningPractices().then(() => fetchListeningPractices()),
      ]);

    const hskCharacterPinyin = Object.fromEntries(
      hskCharacters.map((entry) => [entry.character, entry.most_used_pinyin]),
    );

    let ankiStatus = emptyAnkiStatus;
    try {
      ankiStatus = await fetchAnkiStatus(hskCharacterPinyin);
    } catch {
      // AnkiConnect may be offline during login/sync.
    }

    return {
      characters,
      words,
      hskLevel,
      hskCharacterPinyin,
      ankiStatus,
      grammarPoints: grammar.grammarPoints,
      writingPractices: grammar.writingPractices,
      listeningPractices,
    };
  },
  {
    condition: (_, { getState }) => getState().sync.status !== "loading",
  },
);
