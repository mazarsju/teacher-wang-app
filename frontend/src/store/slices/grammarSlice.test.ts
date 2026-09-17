import { loadGrammarData } from "../thunks/loadGrammarData";
import { resetAppData } from "../thunks/syncAppData";
import reducer, {
  applyGrammarPointUsageUpdates,
  mergeGrammarLevelData,
  setGrammarCatalog,
  setGrammarPointScore,
  setGrammarPointStatus,
  setGrammarPoints,
  setGrammarQuizInProgress,
  setWritingPractices,
} from "./grammarSlice";

const SAMPLE_POINT = {
  id: "1|Basic Sentence Structure",
  hsk_level: 1,
  index: 1,
  title: "Basic Sentence Structure",
  prerequisites: [],
  status: "TODO",
  score: null,
};

const CATALOG_ENTRY = {
  id: SAMPLE_POINT.id,
  hsk_level: SAMPLE_POINT.hsk_level,
  index: SAMPLE_POINT.index,
  title: SAMPLE_POINT.title,
};

const SAMPLE_WRITING_TOPIC = {
  id: "writing-present-yourself",
  title: "Present yourself",
  after_grammar_point: SAMPLE_POINT.id,
  status: "TODO",
};

describe("grammarSlice", () => {
  it("starts with no grammar points", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      items: [],
      writingPractices: [],
      loaded: false,
      error: null,
      loadStatus: "idle",
      loadedLevels: [],
      quizInProgress: false,
    });
  });

  it("tracks loadGrammarData's own lifecycle separately from `loaded`", () => {
    const pending = reducer(undefined, { type: loadGrammarData.pending.type });
    expect(pending.loadStatus).toBe("loading");

    const fulfilled = reducer(pending, { type: loadGrammarData.fulfilled.type });
    expect(fulfilled.loadStatus).toBe("succeeded");

    const rejected = reducer(pending, {
      type: loadGrammarData.rejected.type,
      error: { message: "boom" },
    });
    expect(rejected.loadStatus).toBe("failed");
    expect(rejected.error).toBe("boom");
  });

  it("stores the fetched grammar points", () => {
    const state = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    expect(state.items).toEqual([SAMPLE_POINT]);
  });

  it("stores catalog entries with placeholder per-user fields, marking them loaded", () => {
    const state = reducer(undefined, setGrammarCatalog([CATALOG_ENTRY]));

    expect(state.items).toEqual([
      { ...CATALOG_ENTRY, prerequisites: [], status: "TODO", score: null, usage_count: 0 },
    ]);
    expect(state.loaded).toBe(true);
    expect(state.loadedLevels).toEqual([]);
  });

  it("merges per-level data into the matching catalog entries and tracks the loaded level", () => {
    const populated = reducer(undefined, setGrammarCatalog([CATALOG_ENTRY]));

    const state = reducer(
      populated,
      mergeGrammarLevelData({
        hskLevel: 1,
        points: [
          {
            id: SAMPLE_POINT.id,
            prerequisites: ["some-prereq"],
            status: "DONE",
            score: 82,
            usage_count: 2,
          },
        ],
      }),
    );

    expect(state.items).toEqual([
      {
        ...CATALOG_ENTRY,
        prerequisites: ["some-prereq"],
        status: "DONE",
        score: 82,
        usage_count: 2,
      },
    ]);
    expect(state.loadedLevels).toEqual([1]);
  });

  it("does not add the same level twice to loadedLevels", () => {
    const populated = reducer(undefined, setGrammarCatalog([CATALOG_ENTRY]));
    const once = reducer(
      populated,
      mergeGrammarLevelData({ hskLevel: 1, points: [] }),
    );

    const state = reducer(once, mergeGrammarLevelData({ hskLevel: 1, points: [] }));

    expect(state.loadedLevels).toEqual([1]);
  });

  it("ignores per-level data for a catalog entry that isn't loaded", () => {
    const populated = reducer(undefined, setGrammarCatalog([CATALOG_ENTRY]));

    const state = reducer(
      populated,
      mergeGrammarLevelData({
        hskLevel: 1,
        points: [{ id: "unknown", prerequisites: [], status: "DONE", score: 1, usage_count: 1 }],
      }),
    );

    expect(state.items).toEqual([
      { ...CATALOG_ENTRY, prerequisites: [], status: "TODO", score: null, usage_count: 0 },
    ]);
  });

  it("stores writing practices", () => {
    const state = reducer(undefined, setWritingPractices([SAMPLE_WRITING_TOPIC]));

    expect(state.writingPractices).toEqual([SAMPLE_WRITING_TOPIC]);
  });

  it("updates a single grammar point's status", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    const state = reducer(
      populated,
      setGrammarPointStatus({ id: SAMPLE_POINT.id, status: "SKIP" }),
    );

    expect(state.items).toEqual([{ ...SAMPLE_POINT, status: "SKIP" }]);
  });

  it("ignores a status update for an unknown grammar point id", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    const state = reducer(
      populated,
      setGrammarPointStatus({ id: "unknown", status: "SKIP" }),
    );

    expect(state.items).toEqual([SAMPLE_POINT]);
  });

  it("updates a single grammar point's status and score", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    const state = reducer(
      populated,
      setGrammarPointScore({ id: SAMPLE_POINT.id, status: "DONE", score: 82 }),
    );

    expect(state.items).toEqual([{ ...SAMPLE_POINT, status: "DONE", score: 82 }]);
  });

  it("applies real-life-usage updates (status and usage count) to matching grammar points", () => {
    const populated = reducer(
      undefined,
      setGrammarPoints([SAMPLE_POINT, { ...SAMPLE_POINT, id: "other" }]),
    );

    const state = reducer(
      populated,
      applyGrammarPointUsageUpdates([
        { id: SAMPLE_POINT.id, status: "MASTERED", usage_count: 3 },
      ]),
    );

    expect(state.items).toEqual([
      { ...SAMPLE_POINT, status: "MASTERED", usage_count: 3 },
      { ...SAMPLE_POINT, id: "other" },
    ]);
  });

  it("ignores a usage update for an unknown grammar point id", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    const state = reducer(
      populated,
      applyGrammarPointUsageUpdates([{ id: "unknown", status: "DONE", usage_count: 1 }]),
    );

    expect(state.items).toEqual([SAMPLE_POINT]);
  });

  it("tracks whether a quiz is in progress", () => {
    const state = reducer(undefined, setGrammarQuizInProgress(true));

    expect(state.quizInProgress).toBe(true);
  });

  it("clears on resetAppData", () => {
    const populated = reducer(undefined, setGrammarCatalog([CATALOG_ENTRY]));

    expect(reducer(populated, resetAppData())).toEqual({
      items: [],
      writingPractices: [],
      loaded: false,
      error: null,
      loadStatus: "idle",
      loadedLevels: [],
      quizInProgress: false,
    });
  });
});
