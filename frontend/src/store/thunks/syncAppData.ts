import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import { emptyAnkiStatus, type AnkiStatus } from "../../types/anki";
import type { Character } from "../../types/character";
import type { LlmConfig } from "../../types/llmConfig";
import type { Word } from "../../types/word";
import { fetchLlmConfig } from "../../utils/aiChat/llmConfigApi";
import { fetchAnkiStatus } from "../../utils/anki/ankiApi";
import { fetchCharacters } from "../../utils/knowledgeBase/charactersApi";
import {
  fetchHskLevelStatus,
  type HskLevelStatus,
} from "../../utils/knowledgeBase/hskLevelApi";
import { fetchWords } from "../../utils/knowledgeBase/wordsApi";

export type SyncedAppData = {
  characters: Character[];
  words: Word[];
  settings: LlmConfig;
  hskLevel: HskLevelStatus;
  ankiStatus: AnkiStatus;
};

export const resetAppData = createAction("appData/reset");

export const syncAppData = createAsyncThunk(
  "appData/sync",
  async (): Promise<SyncedAppData> => {
    const [characters, words, settings, hskLevel] = await Promise.all([
      fetchCharacters(),
      fetchWords(),
      fetchLlmConfig(),
      fetchHskLevelStatus(),
    ]);

    let ankiStatus = emptyAnkiStatus;
    try {
      ankiStatus = await fetchAnkiStatus();
    } catch {
      // AnkiConnect may be offline during login/sync.
    }

    return { characters, words, settings, hskLevel, ankiStatus };
  },
);
