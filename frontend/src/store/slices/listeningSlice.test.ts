import { loadListeningData } from "../thunks/loadListeningData";
import { resetAppData } from "../thunks/syncAppData";
import reducer, {
  mergeListeningLevelData,
  setListeningCatalog,
  setListeningPracticeResult,
} from "./listeningSlice";

const CATALOG_ENTRY = {
  id: "listening-family-size",
  title: "How many are in your family?",
  hsk_level: 1,
  type: "dialog",
  topic: "family",
  translated_topic: "family",
};

describe("listeningSlice", () => {
  it("starts with no listening practices", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      items: [],
      loaded: false,
      error: null,
      loadStatus: "idle",
      loadedLevels: [],
    });
  });

  it("tracks loadListeningData's own lifecycle separately from `loaded`", () => {
    const pending = reducer(undefined, { type: loadListeningData.pending.type });
    expect(pending.loadStatus).toBe("loading");

    const fulfilled = reducer(pending, { type: loadListeningData.fulfilled.type });
    expect(fulfilled.loadStatus).toBe("succeeded");

    const rejected = reducer(pending, {
      type: loadListeningData.rejected.type,
      error: { message: "boom" },
    });
    expect(rejected.loadStatus).toBe("failed");
    expect(rejected.error).toBe("boom");
  });

  it("stores catalog entries with placeholder per-user fields, marking them loaded", () => {
    const state = reducer(undefined, setListeningCatalog([CATALOG_ENTRY]));

    expect(state.items).toEqual([
      { ...CATALOG_ENTRY, status: "TODO", vocabulary_score: 0, grammar_score: 0 },
    ]);
    expect(state.loaded).toBe(true);
    expect(state.loadedLevels).toEqual([]);
  });

  it("merges per-level data into the matching catalog entries and tracks the loaded level", () => {
    const populated = reducer(undefined, setListeningCatalog([CATALOG_ENTRY]));

    const state = reducer(
      populated,
      mergeListeningLevelData({
        hskLevel: 1,
        practices: [
          {
            id: CATALOG_ENTRY.id,
            status: "DONE",
            vocabulary_score: 80,
            grammar_score: 50,
          },
        ],
      }),
    );

    expect(state.items).toEqual([
      { ...CATALOG_ENTRY, status: "DONE", vocabulary_score: 80, grammar_score: 50 },
    ]);
    expect(state.loadedLevels).toEqual([1]);
  });

  it("does not add the same level twice to loadedLevels", () => {
    const populated = reducer(undefined, setListeningCatalog([CATALOG_ENTRY]));
    const once = reducer(
      populated,
      mergeListeningLevelData({ hskLevel: 1, practices: [] }),
    );

    const state = reducer(
      once,
      mergeListeningLevelData({ hskLevel: 1, practices: [] }),
    );

    expect(state.loadedLevels).toEqual([1]);
  });

  it("ignores per-level data for a catalog entry that isn't loaded", () => {
    const populated = reducer(undefined, setListeningCatalog([CATALOG_ENTRY]));

    const state = reducer(
      populated,
      mergeListeningLevelData({
        hskLevel: 1,
        practices: [
          { id: "unknown", status: "DONE", vocabulary_score: 1, grammar_score: 1 },
        ],
      }),
    );

    expect(state.items).toEqual([
      { ...CATALOG_ENTRY, status: "TODO", vocabulary_score: 0, grammar_score: 0 },
    ]);
  });

  it("updates a single practice's result (status and both scores)", () => {
    const populated = reducer(undefined, setListeningCatalog([CATALOG_ENTRY]));

    const state = reducer(
      populated,
      setListeningPracticeResult({
        id: CATALOG_ENTRY.id,
        status: "DONE",
        vocabulary_score: 90,
        grammar_score: 70,
      }),
    );

    expect(state.items).toEqual([
      { ...CATALOG_ENTRY, status: "DONE", vocabulary_score: 90, grammar_score: 70 },
    ]);
  });

  it("ignores a result update for an unknown practice id", () => {
    const populated = reducer(undefined, setListeningCatalog([CATALOG_ENTRY]));

    const state = reducer(
      populated,
      setListeningPracticeResult({
        id: "unknown",
        status: "DONE",
        vocabulary_score: 1,
        grammar_score: 1,
      }),
    );

    expect(state.items).toEqual([
      { ...CATALOG_ENTRY, status: "TODO", vocabulary_score: 0, grammar_score: 0 },
    ]);
  });

  it("clears on resetAppData", () => {
    const populated = reducer(undefined, setListeningCatalog([CATALOG_ENTRY]));

    expect(reducer(populated, resetAppData())).toEqual({
      items: [],
      loaded: false,
      error: null,
      loadStatus: "idle",
      loadedLevels: [],
    });
  });
});
