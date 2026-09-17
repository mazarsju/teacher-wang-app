import { createAppStore } from "../index";
import { loadListeningData } from "./loadListeningData";
import {
  fetchListeningPracticesForLevel,
  fetchListeningPracticesLight,
} from "../../utils/listening/listeningApi";
import { fetchHskLevelLight } from "../../utils/knowledgeBase/hskLevelApi";

vi.mock("../../utils/listening/listeningApi");
vi.mock("../../utils/knowledgeBase/hskLevelApi");

function catalogEntry(id: string, hskLevel: number) {
  return {
    id,
    title: id,
    hsk_level: hskLevel,
    type: "dialog",
    topic: "family",
    translated_topic: "family",
  };
}

function levelEntry(id: string) {
  return { id, status: "DONE", vocabulary_score: 80, grammar_score: 50 };
}

describe("loadListeningData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchHskLevelLight).mockResolvedValue(2);
    vi.mocked(fetchListeningPracticesLight).mockResolvedValue([
      catalogEntry("l1", 1),
      catalogEntry("l2", 2),
      catalogEntry("l3", 3),
    ]);
    vi.mocked(fetchListeningPracticesForLevel).mockImplementation(async (level) =>
      level === 1 ? [levelEntry("l1")] : level === 2 ? [levelEntry("l2")] : [],
    );
  });

  it("calls hsk-level-light before any listening endpoint", async () => {
    const calls: string[] = [];
    vi.mocked(fetchHskLevelLight).mockImplementation(async () => {
      calls.push("hsk-level-light");
      return 2;
    });
    vi.mocked(fetchListeningPracticesLight).mockImplementation(async () => {
      calls.push("listening-practices-light");
      return [];
    });
    vi.mocked(fetchListeningPracticesForLevel).mockImplementation(async (level) => {
      calls.push(`listening-practices/${level}`);
      return [];
    });

    const store = createAppStore();
    await store.dispatch(loadListeningData());

    expect(calls[0]).toBe("hsk-level-light");
    expect(calls.slice(1)).toContain("listening-practices-light");
  });

  it("fetches one call per level up to the achieved level + 1, and upserts every level into the store without erasing earlier ones", async () => {
    const store = createAppStore();

    await store.dispatch(loadListeningData());

    // current_level 2 → target 3: levels 1, 2, 3 each get their own call.
    expect(fetchListeningPracticesForLevel).toHaveBeenCalledTimes(3);
    expect(fetchListeningPracticesForLevel).toHaveBeenCalledWith(1);
    expect(fetchListeningPracticesForLevel).toHaveBeenCalledWith(2);
    expect(fetchListeningPracticesForLevel).toHaveBeenCalledWith(3);
    // The light catalog call is scoped to that same ceiling.
    expect(fetchListeningPracticesLight).toHaveBeenCalledWith(3);

    const state = store.getState().listening;
    expect(state.loadedLevels.slice().sort()).toEqual([1, 2, 3]);
    // Level 1 and 2's real scores came back — level 3 had no per-level data
    // in this fixture but is still present (upserted, not dropped) with its
    // catalog fields intact.
    expect(state.items).toEqual([
      { ...catalogEntry("l1", 1), ...levelEntry("l1") },
      { ...catalogEntry("l2", 2), ...levelEntry("l2") },
      { ...catalogEntry("l3", 3), status: "TODO", vocabulary_score: 0, grammar_score: 0 },
    ]);
  });

  it("treats a null achieved level (never computed) as level 0, loading only level 1", async () => {
    vi.mocked(fetchHskLevelLight).mockResolvedValue(null);
    const store = createAppStore();

    await store.dispatch(loadListeningData());

    expect(fetchListeningPracticesForLevel).toHaveBeenCalledTimes(1);
    expect(fetchListeningPracticesForLevel).toHaveBeenCalledWith(1);
    expect(fetchListeningPracticesLight).toHaveBeenCalledWith(1);
  });

  it("only runs once: a second dispatch after success is a no-op", async () => {
    const store = createAppStore();

    await store.dispatch(loadListeningData());
    await store.dispatch(loadListeningData());

    expect(fetchHskLevelLight).toHaveBeenCalledTimes(1);
  });

  it("skips a concurrent second dispatch while the first is still in flight", async () => {
    const store = createAppStore();

    const first = store.dispatch(loadListeningData());
    const second = store.dispatch(loadListeningData());
    await Promise.all([first, second]);

    expect(fetchHskLevelLight).toHaveBeenCalledTimes(1);
  });
});
