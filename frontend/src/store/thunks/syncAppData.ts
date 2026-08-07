import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import { emptyAnkiStatus, type AnkiStatus } from "../../types/anki";
import type { Character } from "../../types/character";
import type { Word } from "../../types/word";
import { fetchAnkiStatus } from "../../utils/anki/ankiApi";
import { fetchCharacters } from "../../utils/knowledgeBase/charactersApi";
import { fetchHskCharacters } from "../../utils/knowledgeBase/hskCharactersApi";
import {
  fetchHskLevelStatus,
  type HskLevelStatus,
} from "../../utils/knowledgeBase/hskLevelApi";
import { fetchWords } from "../../utils/knowledgeBase/wordsApi";

export type SyncedAppData = {
  characters: Character[];
  words: Word[];
  hskLevel: HskLevelStatus;
  hskCharacterPinyin: Record<string, string>;
  ankiStatus: AnkiStatus;
};

export const resetAppData = createAction("appData/reset");

export const resetKnowledgeBaseData = createAction("knowledgeBaseData/reset");

export const syncAppData = createAsyncThunk(
  "appData/sync",
  async (): Promise<SyncedAppData> => {
    const [characters, words, hskLevel, hskCharacters] = await Promise.all([
      fetchCharacters(),
      fetchWords(),
      fetchHskLevelStatus(),
      fetchHskCharacters(),
    ]);

    const hskCharacterPinyin = Object.fromEntries(
      hskCharacters.map((entry) => [entry.character, entry.most_used_pinyin]),
    );

    let ankiStatus = emptyAnkiStatus;
    try {
      ankiStatus = await fetchAnkiStatus();
    } catch {
      // AnkiConnect may be offline during login/sync.
    }

    return { characters, words, hskLevel, hskCharacterPinyin, ankiStatus };
  },
);
