import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import i18n from "../../i18n";
import type {
  ListeningPractice,
  ListeningPracticeCatalogEntry,
  ListeningPracticeLevelEntry,
} from "../../types/listeningPractice";
import { loadListeningData } from "../thunks/loadListeningData";
import { resetAppData } from "../thunks/syncAppData";

export type ListeningState = {
  items: ListeningPractice[];
  // True once the catalog (light) fetch has landed — gates the mosaic vs. a
  // full-page loading message. Per-level score readiness is tracked
  // separately in loadedLevels below.
  loaded: boolean;
  error: string | null;
  // loadListeningData's own pending/fulfilled/rejected lifecycle, used only
  // to dedupe a concurrent re-dispatch — UI code should read
  // `loaded`/`error`/`loadedLevels` instead.
  loadStatus: "idle" | "loading" | "succeeded" | "failed";
  loadedLevels: number[];
};

const initialState: ListeningState = {
  items: [],
  loaded: false,
  error: null,
  loadStatus: "idle",
  loadedLevels: [],
};

const listeningSlice = createSlice({
  name: "listening",
  initialState,
  reducers: {
    // Catalog fields only (id/title/hsk_level/type/topic/translated_topic):
    // fast, no per-user data yet, so status/vocabulary_score/grammar_score
    // start at placeholder defaults until mergeListeningLevelData fills
    // them in per level.
    setListeningCatalog(
      state,
      action: PayloadAction<ListeningPracticeCatalogEntry[]>,
    ) {
      state.items = action.payload.map((entry) => ({
        ...entry,
        status: "TODO",
        vocabulary_score: 0,
        grammar_score: 0,
      }));
      state.loadedLevels = [];
      state.loaded = true;
    },
    mergeListeningLevelData(
      state,
      action: PayloadAction<{
        hskLevel: number;
        practices: ListeningPracticeLevelEntry[];
      }>,
    ) {
      const byId = new Map(
        action.payload.practices.map((entry) => [entry.id, entry]),
      );
      for (const item of state.items) {
        const entry = byId.get(item.id);
        if (entry) {
          item.status = entry.status;
          item.vocabulary_score = entry.vocabulary_score;
          item.grammar_score = entry.grammar_score;
        }
      }
      if (!state.loadedLevels.includes(action.payload.hskLevel)) {
        state.loadedLevels.push(action.payload.hskLevel);
      }
    },
    setListeningPracticeResult(
      state,
      action: PayloadAction<{
        id: string;
        status: string;
        vocabulary_score: number;
        grammar_score: number;
      }>,
    ) {
      const practice = state.items.find((item) => item.id === action.payload.id);
      if (practice) {
        practice.status = action.payload.status;
        practice.vocabulary_score = action.payload.vocabulary_score;
        practice.grammar_score = action.payload.grammar_score;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadListeningData.pending, (state) => {
        state.loadStatus = "loading";
        state.error = null;
      })
      .addCase(loadListeningData.fulfilled, (state) => {
        state.loadStatus = "succeeded";
      })
      .addCase(loadListeningData.rejected, (state, action) => {
        state.loadStatus = "failed";
        state.error =
          action.error.message ?? i18n.t("listening:listeningPage.loadError");
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const {
  setListeningCatalog,
  mergeListeningLevelData,
  setListeningPracticeResult,
} = listeningSlice.actions;
export default listeningSlice.reducer;
