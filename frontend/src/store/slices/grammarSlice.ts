import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import i18n from "../../i18n";
import type { GrammarPoint } from "../../types/grammarPoint";
import type { WritingTopic } from "../../types/writingTopic";
import type {
  GrammarPointCatalogEntry,
  GrammarPointLevelEntry,
} from "../../utils/grammar/grammarPointsApi";
import { loadGrammarData } from "../thunks/loadGrammarData";
import { resetAppData } from "../thunks/syncAppData";

export type GrammarState = {
  items: GrammarPoint[];
  writingPractices: WritingTopic[];
  // True once the catalog (light) fetch has landed — gates the table vs. a
  // full-page loading message. Per-level status/score readiness is tracked
  // separately in loadedLevels below.
  loaded: boolean;
  error: string | null;
  // loadGrammarData's own pending/fulfilled/rejected lifecycle, used only to
  // dedupe a concurrent re-dispatch (e.g. React StrictMode's double-invoked
  // effect) — UI code should read `loaded`/`error`/`loadedLevels` instead.
  loadStatus: "idle" | "loading" | "succeeded" | "failed";
  loadedLevels: number[];
  quizInProgress: boolean;
};

const initialState: GrammarState = {
  items: [],
  writingPractices: [],
  loaded: false,
  error: null,
  loadStatus: "idle",
  loadedLevels: [],
  quizInProgress: false,
};

const grammarSlice = createSlice({
  name: "grammar",
  initialState,
  reducers: {
    // Catalog fields only (id/hsk_level/index/title): fast, no per-user data
    // yet, so status/score/usage_count/prerequisites start at placeholder
    // defaults until mergeGrammarLevelData fills them in per level.
    setGrammarCatalog(state, action: PayloadAction<GrammarPointCatalogEntry[]>) {
      state.items = action.payload.map((entry) => ({
        ...entry,
        prerequisites: [],
        status: "TODO",
        score: null,
        usage_count: 0,
      }));
      state.loadedLevels = [];
      state.loaded = true;
    },
    mergeGrammarLevelData(
      state,
      action: PayloadAction<{ hskLevel: number; points: GrammarPointLevelEntry[] }>,
    ) {
      const byId = new Map(action.payload.points.map((entry) => [entry.id, entry]));
      for (const point of state.items) {
        const entry = byId.get(point.id);
        if (entry) {
          point.prerequisites = entry.prerequisites;
          point.status = entry.status;
          point.score = entry.score;
          point.usage_count = entry.usage_count;
        }
      }
      if (!state.loadedLevels.includes(action.payload.hskLevel)) {
        state.loadedLevels.push(action.payload.hskLevel);
      }
    },
    setWritingPractices(state, action: PayloadAction<WritingTopic[]>) {
      state.writingPractices = action.payload;
    },
    setGrammarPoints(state, action: PayloadAction<GrammarPoint[]>) {
      state.items = action.payload;
    },
    setGrammarPointStatus(
      state,
      action: PayloadAction<{ id: string; status: string }>,
    ) {
      const point = state.items.find((item) => item.id === action.payload.id);
      if (point) {
        point.status = action.payload.status;
      }
    },
    setGrammarPointScore(
      state,
      action: PayloadAction<{ id: string; status: string; score: number }>,
    ) {
      const point = state.items.find((item) => item.id === action.payload.id);
      if (point) {
        point.status = action.payload.status;
        point.score = action.payload.score;
      }
    },
    setGrammarQuizInProgress(state, action: PayloadAction<boolean>) {
      state.quizInProgress = action.payload;
    },
    applyGrammarPointUsageUpdates(
      state,
      action: PayloadAction<{ id: string; status: string; usage_count: number }[]>,
    ) {
      for (const update of action.payload) {
        const point = state.items.find((item) => item.id === update.id);
        if (point) {
          point.status = update.status;
          point.usage_count = update.usage_count;
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadGrammarData.pending, (state) => {
        state.loadStatus = "loading";
        state.error = null;
      })
      .addCase(loadGrammarData.fulfilled, (state) => {
        state.loadStatus = "succeeded";
      })
      .addCase(loadGrammarData.rejected, (state, action) => {
        state.loadStatus = "failed";
        state.error = action.error.message ?? i18n.t("grammar:grammarPage.loadError");
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const {
  setGrammarCatalog,
  mergeGrammarLevelData,
  setWritingPractices,
  setGrammarPoints,
  setGrammarPointStatus,
  setGrammarPointScore,
  setGrammarQuizInProgress,
  applyGrammarPointUsageUpdates,
} = grammarSlice.actions;
export default grammarSlice.reducer;
