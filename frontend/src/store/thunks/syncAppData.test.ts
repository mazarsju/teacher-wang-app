import { createAppStore } from "../index";
import { syncAppData } from "./syncAppData";
import { emptyAnkiStatus } from "../../types/anki";
import { fetchAnkiStatus } from "../../utils/anki/ankiApi";
import { fetchCharacters } from "../../utils/knowledgeBase/charactersApi";
import { fetchHskCharacters } from "../../utils/knowledgeBase/hskCharactersApi";
import { fetchHskLevelStatus } from "../../utils/knowledgeBase/hskLevelApi";
import { fetchWords } from "../../utils/knowledgeBase/wordsApi";

vi.mock("../../utils/anki/ankiApi");
vi.mock("../../utils/knowledgeBase/charactersApi");
vi.mock("../../utils/knowledgeBase/hskCharactersApi");
vi.mock("../../utils/knowledgeBase/hskLevelApi");
vi.mock("../../utils/knowledgeBase/wordsApi");

describe("syncAppData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCharacters).mockResolvedValue([]);
    vi.mocked(fetchWords).mockResolvedValue([]);
    vi.mocked(fetchHskLevelStatus).mockResolvedValue({
      current_level: null,
      next_level: 1,
      characters_to_next_level: 1,
      progress_to_next_level: 0,
      missing_characters: [],
      max_level: 7,
      completion_ratio: 0,
    });
    vi.mocked(fetchHskCharacters).mockResolvedValue([]);
    vi.mocked(fetchAnkiStatus).mockResolvedValue(emptyAnkiStatus);
  });

  it("skips a second sync dispatched while the first is still in flight", async () => {
    const store = createAppStore();

    const first = store.dispatch(syncAppData());
    const second = store.dispatch(syncAppData());

    await Promise.all([first, second]);

    expect(fetchCharacters).toHaveBeenCalledTimes(1);
  });

  it("allows a later sync once the previous one has settled", async () => {
    const store = createAppStore();

    await store.dispatch(syncAppData());
    await store.dispatch(syncAppData());

    expect(fetchCharacters).toHaveBeenCalledTimes(2);
  });
});
