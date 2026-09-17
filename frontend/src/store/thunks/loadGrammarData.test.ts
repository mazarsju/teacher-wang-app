import { createAppStore } from "../index";
import { loadGrammarData } from "./loadGrammarData";
import {
  fetchGrammarPointsForLevel,
  fetchGrammarPointsLight,
} from "../../utils/grammar/grammarPointsApi";
import { fetchWritingPractices } from "../../utils/grammar/writingPracticesApi";
import { fetchHskLevelLight } from "../../utils/knowledgeBase/hskLevelApi";

vi.mock("../../utils/grammar/grammarPointsApi");
vi.mock("../../utils/grammar/writingPracticesApi");
vi.mock("../../utils/knowledgeBase/hskLevelApi");

function catalogEntry(id: string, hskLevel: number) {
  return { id, hsk_level: hskLevel, index: 1, title: id };
}

function levelEntry(id: string) {
  return { id, prerequisites: [], status: "DONE", score: 90, usage_count: 1 };
}

describe("loadGrammarData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchHskLevelLight).mockResolvedValue(2);
    vi.mocked(fetchGrammarPointsLight).mockResolvedValue([
      catalogEntry("1|a", 1),
      catalogEntry("2|a", 2),
      catalogEntry("3|a", 3),
    ]);
    vi.mocked(fetchGrammarPointsForLevel).mockImplementation(async (level) =>
      level === 1 ? [levelEntry("1|a")] : level === 2 ? [levelEntry("2|a")] : [],
    );
    vi.mocked(fetchWritingPractices).mockResolvedValue([]);
  });

  it("calls hsk-level-light before any grammar endpoint", async () => {
    const calls: string[] = [];
    vi.mocked(fetchHskLevelLight).mockImplementation(async () => {
      calls.push("hsk-level-light");
      return 2;
    });
    vi.mocked(fetchGrammarPointsLight).mockImplementation(async () => {
      calls.push("grammar-points-light");
      return [];
    });
    vi.mocked(fetchGrammarPointsForLevel).mockImplementation(async (level) => {
      calls.push(`grammar-points/${level}`);
      return [];
    });

    const store = createAppStore();
    await store.dispatch(loadGrammarData());

    expect(calls[0]).toBe("hsk-level-light");
    expect(calls.slice(1)).toContain("grammar-points-light");
  });

  it("fetches one call per level up to the achieved level + 1, and upserts every level into the store without erasing earlier ones", async () => {
    const store = createAppStore();

    await store.dispatch(loadGrammarData());

    // current_level 2 → target 3: levels 1, 2, 3 each get their own call.
    expect(fetchGrammarPointsForLevel).toHaveBeenCalledTimes(3);
    expect(fetchGrammarPointsForLevel).toHaveBeenCalledWith(1);
    expect(fetchGrammarPointsForLevel).toHaveBeenCalledWith(2);
    expect(fetchGrammarPointsForLevel).toHaveBeenCalledWith(3);

    const state = store.getState().grammar;
    expect(state.loadedLevels.slice().sort()).toEqual([1, 2, 3]);
    // Level 1 and 2's real status came back — level 3 had no per-level data
    // in this fixture but is still present (upserted, not dropped) with its
    // catalog fields intact.
    expect(state.items).toEqual([
      { ...catalogEntry("1|a", 1), ...levelEntry("1|a") },
      { ...catalogEntry("2|a", 2), ...levelEntry("2|a") },
      { ...catalogEntry("3|a", 3), prerequisites: [], status: "TODO", score: null, usage_count: 0 },
    ]);
  });

  it("treats a null achieved level (never computed) as level 0, loading only level 1", async () => {
    vi.mocked(fetchHskLevelLight).mockResolvedValue(null);
    const store = createAppStore();

    await store.dispatch(loadGrammarData());

    expect(fetchGrammarPointsForLevel).toHaveBeenCalledTimes(1);
    expect(fetchGrammarPointsForLevel).toHaveBeenCalledWith(1);
  });

  it("stores the current level from hsk-level-light", async () => {
    const store = createAppStore();

    await store.dispatch(loadGrammarData());

    expect(store.getState().hsk.currentLevelLight).toBe(2);
  });

  it("only runs once: a second dispatch after success is a no-op", async () => {
    const store = createAppStore();

    await store.dispatch(loadGrammarData());
    await store.dispatch(loadGrammarData());

    expect(fetchHskLevelLight).toHaveBeenCalledTimes(1);
  });

  it("a second dispatch that starts while the first is still awaiting hsk-level-light does not steal the load with a null level", async () => {
    // Regression test for a real bug: chaining loadGrammarData off a
    // *shared* hsk-level-light thunk raced under StrictMode's double-invoked
    // login effect — a skipped (condition-false) dispatch of that shared
    // thunk resolved immediately rather than waiting for the real fetch, so
    // code chained off it ran with currentLevelLight still null and loaded
    // only level 1, then the correct retry got silently dropped by this
    // thunk's own idle-only guard. Each thunk fetching hsk-level-light
    // itself must not exhibit that: two dispatches racing here should still
    // only ever load with the real resolved level, never a premature null.
    let resolveHskLevelLight: (value: number | null) => void = () => {};
    vi.mocked(fetchHskLevelLight).mockImplementation(
      () => new Promise((resolve) => { resolveHskLevelLight = resolve; }),
    );
    const store = createAppStore();

    const first = store.dispatch(loadGrammarData());
    const second = store.dispatch(loadGrammarData());
    resolveHskLevelLight(2);
    await Promise.all([first, second]);

    expect(fetchGrammarPointsForLevel).toHaveBeenCalledTimes(3);
    expect(store.getState().grammar.loadedLevels.slice().sort()).toEqual([1, 2, 3]);
  });

  it("skips a concurrent second dispatch while the first is still in flight", async () => {
    const store = createAppStore();

    const first = store.dispatch(loadGrammarData());
    const second = store.dispatch(loadGrammarData());
    await Promise.all([first, second]);

    expect(fetchHskLevelLight).toHaveBeenCalledTimes(1);
  });
});
