import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./ankiConnect", () => ({
  AnkiConnectError: class AnkiConnectError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AnkiConnectError";
    }
  },
  addNotes: vi.fn(),
  isConnected: vi.fn(),
  syncWithAnkiWeb: vi.fn(),
}));

vi.mock("./ankiDbClient", () => ({
  fetchBackendAnkiStatus: vi.fn(),
  fetchMappedNotes: vi.fn(),
  fetchSyncData: vi.fn(),
  markSynchronizedRequest: vi.fn(),
  pullApplyRequest: vi.fn(),
}));

import { addNotes, isConnected, syncWithAnkiWeb } from "./ankiConnect";
import {
  fetchBackendAnkiStatus,
  fetchMappedNotes,
  fetchSyncData,
  markSynchronizedRequest,
  pullApplyRequest,
} from "./ankiDbClient";
import {
  fetchAnkiPendingSync,
  fetchAnkiStatus,
  runAnkiQuickSync,
  runAnkiSync,
} from "./ankiSync";

const mockIsConnected = vi.mocked(isConnected);
const mockFetchBackendStatus = vi.mocked(fetchBackendAnkiStatus);
const mockFetchSyncData = vi.mocked(fetchSyncData);
const mockFetchMappedNotes = vi.mocked(fetchMappedNotes);
const mockMark = vi.mocked(markSynchronizedRequest);
const mockPullApply = vi.mocked(pullApplyRequest);
const mockAddNotes = vi.mocked(addNotes);
const mockSyncWeb = vi.mocked(syncWithAnkiWeb);

const configuredDeck = {
  status: "synchronized" as const,
  deck_name: "Vocab",
  model_name: "Model",
  fields: {
    writing: "writing",
    pinyin: "pinyin",
    definition: "definition",
  },
};

describe("ankiSync", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetchAnkiStatus merges connected from AnkiConnect", async () => {
    mockIsConnected.mockResolvedValue(true);
    mockFetchBackendStatus.mockResolvedValue({
      synchronization_status: "not_synchronized",
      pending_push_estimate: 0,
      decks: {
        mandarin_vocabulary: {
          status: "not_configured",
          deck_name: "",
          model_name: "",
          fields: {},
        },
        mandarin_writing: {
          status: "not_configured",
          deck_name: "",
          model_name: "",
          fields: {},
        },
      },
    });

    const status = await fetchAnkiStatus();
    expect(status.connected).toBe(true);
  });

  it("fetchAnkiPendingSync builds vocabulary pending payload", async () => {
    mockFetchSyncData.mockResolvedValue({
      kind: "mandarin_vocabulary",
      push_cards: [
        {
          id: "水",
          writing: "水",
          pinyin: "shui3",
          definition: "water",
        },
      ],
      unsyncable: [],
      local_words: [],
      characters: [],
      ignore_keys: [],
      deck: configuredDeck,
    });
    mockFetchMappedNotes.mockResolvedValue([]);

    const pending = await fetchAnkiPendingSync("mandarin_vocabulary");
    expect(pending.count).toBe(1);
    expect(pending.cards[0]?.id).toBe("水");
  });

  it("runAnkiSync push adds notes then marks synchronized", async () => {
    mockFetchSyncData.mockResolvedValue({
      kind: "mandarin_vocabulary",
      push_cards: [
        {
          id: "水",
          writing: "水",
          pinyin: "shui3",
          definition: "water",
        },
      ],
      unsyncable: [],
      local_words: [],
      characters: [],
      ignore_keys: [],
      deck: configuredDeck,
    });
    mockFetchMappedNotes.mockResolvedValue([]);
    mockAddNotes.mockResolvedValue([1]);
    mockMark.mockResolvedValue({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "push",
      added: 1,
      ignored: 0,
      failed: 0,
      deck: configuredDeck,
    });

    const result = await runAnkiSync({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "push",
    });

    expect(mockAddNotes).toHaveBeenCalled();
    expect(mockMark).toHaveBeenCalled();
    expect(mockSyncWeb).toHaveBeenCalled();
    expect(result.added).toBe(1);
  });

  it("runAnkiSync pull applies import via backend", async () => {
    mockFetchSyncData.mockResolvedValue({
      kind: "mandarin_vocabulary",
      push_cards: [],
      unsyncable: [],
      local_words: [],
      characters: [],
      ignore_keys: [],
      deck: configuredDeck,
    });
    mockFetchMappedNotes.mockResolvedValue([
      { writing: "风", pinyin: "feng1", definition: "wind" },
    ]);
    mockPullApply.mockResolvedValue({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "pull",
      added: 1,
      ignored: 0,
      failed: 0,
      deck: configuredDeck,
    });

    await runAnkiSync({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "pull",
    });

    expect(mockPullApply).toHaveBeenCalled();
  });

  it("runAnkiQuickSync pushes both decks then syncs AnkiWeb once", async () => {
    mockFetchSyncData.mockImplementation(async (kind) => ({
      kind,
      push_cards: [],
      unsyncable: [],
      local_words: [],
      characters: [],
      ignore_keys: [],
      deck:
        kind === "mandarin_vocabulary"
          ? configuredDeck
          : {
              status: "synchronized" as const,
              deck_name: "W",
              model_name: "Basic",
              fields: { recto: "Front", verso: "Back" },
            },
    }));
    mockFetchMappedNotes.mockResolvedValue([]);
    mockMark.mockResolvedValue({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "push",
      added: 0,
      ignored: 0,
      failed: 0,
      deck: configuredDeck,
    });
    mockIsConnected.mockResolvedValue(false);
    mockFetchBackendStatus.mockResolvedValue({
      synchronization_status: "synchronized",
      pending_push_estimate: 0,
      decks: {
        mandarin_vocabulary: configuredDeck,
        mandarin_writing: {
          status: "synchronized",
          deck_name: "W",
          model_name: "Basic",
          fields: { recto: "Front", verso: "Back" },
        },
      },
    });

    const result = await runAnkiQuickSync();
    expect(result.pending_push_estimate).toBe(0);
    expect(mockSyncWeb).not.toHaveBeenCalled();
  });
});
