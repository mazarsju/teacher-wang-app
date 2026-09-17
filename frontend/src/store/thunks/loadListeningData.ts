import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import {
  fetchListeningPracticesForLevel,
  fetchListeningPracticesLight,
} from "../../utils/listening/listeningApi";
import { fetchHskLevelLight, HSK_MAX_LEVEL } from "../../utils/knowledgeBase/hskLevelApi";
import { mergeListeningLevelData, setListeningCatalog } from "../slices/listeningSlice";
import { setHskLevelLight } from "../slices/hskSlice";

// Runs once, right after login, mirroring loadGrammarData: GET
// /hsk-level-light first, then (knowing which levels are visible) the
// listening catalog — scoped to those same levels via max_hsk_level, since
// there's no reason to load a catalog entry for a level that's about to be
// filtered out anyway — and one GET /listening-practices/<level> call per
// visible level, so the Listening tab already has its data by the time the
// learner opens it.
//
// Deliberately fetches hsk-level-light itself rather than sharing a single
// fetch with loadGrammarData — see loadGrammarData's own comment on the
// StrictMode race that causes if this is instead chained off a shared
// thunk's resolved promise.
export const loadListeningData = createAsyncThunk<void, void, { state: RootState }>(
  "listening/loadAfterLogin",
  async (_, { dispatch }) => {
    const currentLevel = await fetchHskLevelLight();
    dispatch(setHskLevelLight(currentLevel));

    const targetLevel = Math.min((currentLevel ?? 0) + 1, HSK_MAX_LEVEL);
    const catalog = await fetchListeningPracticesLight(targetLevel);
    dispatch(setListeningCatalog(catalog));

    await Promise.all(
      Array.from({ length: targetLevel }, (_, index) => index + 1).map((level) =>
        fetchListeningPracticesForLevel(level).then((practices) =>
          dispatch(mergeListeningLevelData({ hskLevel: level, practices })),
        ),
      ),
    );
  },
  {
    // Runs exactly once per session — see loadGrammarData's own comment.
    condition: (_, { getState }) => getState().listening.loadStatus === "idle",
  },
);
