import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import {
  fetchGrammarPointsForLevel,
  fetchGrammarPointsLight,
} from "../../utils/grammar/grammarPointsApi";
import { fetchWritingPractices } from "../../utils/grammar/writingPracticesApi";
import { fetchHskLevelLight, HSK_MAX_LEVEL } from "../../utils/knowledgeBase/hskLevelApi";
import {
  mergeGrammarLevelData,
  setGrammarCatalog,
  setWritingPractices,
} from "../slices/grammarSlice";
import { setHskLevelLight } from "../slices/hskSlice";

// Runs once, right after login: GET /hsk-level-light first, then (knowing
// which levels are visible) the grammar catalog and one GET
// /grammar-points/<level> call per visible level, so the Grammar tab already
// has its data by the time the learner opens it. Never re-run on demand (not
// even by the "Synchro" button) — see hsk-level-light's own doc comment.
//
// Deliberately fetches hsk-level-light itself rather than sharing a single
// fetch with loadListeningData via a `.then()` chain in App.tsx: under React
// StrictMode's double-invoked login effect, a *second* dispatch of a shared
// "fetch it once" thunk gets skipped by its own `condition` guard, but a
// skipped dispatch's promise resolves immediately rather than once the real
// in-flight fetch finishes — so code chained off it (dispatching this thunk)
// would run with `currentLevelLight` still null, load only level 1, and then
// have the correct later retry silently dropped by this thunk's own
// idle-only guard. Each thunk owning its own fetch has no such race, since
// its `condition` check is a synchronous read of its own slice's status.
export const loadGrammarData = createAsyncThunk<void, void, { state: RootState }>(
  "grammar/loadAfterLogin",
  async (_, { dispatch }) => {
    const currentLevel = await fetchHskLevelLight();
    dispatch(setHskLevelLight(currentLevel));

    const catalog = await fetchGrammarPointsLight();
    dispatch(setGrammarCatalog(catalog));

    const targetLevel = Math.min((currentLevel ?? 0) + 1, HSK_MAX_LEVEL);
    await Promise.all([
      ...Array.from({ length: targetLevel }, (_, index) => index + 1).map((level) =>
        fetchGrammarPointsForLevel(level).then((points) =>
          dispatch(mergeGrammarLevelData({ hskLevel: level, points })),
        ),
      ),
      fetchWritingPractices().then((topics) => dispatch(setWritingPractices(topics))),
    ]);
  },
  {
    // Runs exactly once per session: any dispatch after the first (whether a
    // concurrent StrictMode double-invoke, or a later re-dispatch such as a
    // manual "Synchro") is a no-op. A failed load stays failed until logout
    // resets the slice, rather than silently retrying on the next dispatch.
    condition: (_, { getState }) => getState().grammar.loadStatus === "idle",
  },
);
