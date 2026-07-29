import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchBackendAnkiStatus,
  fetchSyncData,
  markSynchronizedRequest,
  persistDeckSetup,
  pullApplyRequest,
} from "./ankiDbClient";

describe("ankiDbClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchSyncData loads sync payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          kind: "mandarin_vocabulary",
          push_cards: [],
          unsyncable: [],
          local_words: [],
          characters: [],
          ignore_keys: [],
          deck: {
            status: "synchronized",
            deck_name: "Vocab",
            model_name: "Model",
            fields: {},
          },
        }),
      }),
    );

    const data = await fetchSyncData("mandarin_vocabulary");
    expect(data.kind).toBe("mandarin_vocabulary");
    expect(fetch).toHaveBeenCalledWith("/anki/sync/data/mandarin_vocabulary", {
      method: "GET",
    });
  });

  it("fetchBackendAnkiStatus loads status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          synchronization_status: "not_synchronized",
          pending_push_estimate: 0,
          decks: {},
        }),
      }),
    );

    await expect(fetchBackendAnkiStatus()).resolves.toMatchObject({
      pending_push_estimate: 0,
    });
  });

  it("markSynchronizedRequest and pullApplyRequest post bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        kind: "mandarin_vocabulary",
        action: "partial",
        added: 0,
        ignored: 1,
        failed: 0,
        deck: { status: "synchronized" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await markSynchronizedRequest({
      kind: "mandarin_vocabulary",
      ids: ["水"],
    });
    await pullApplyRequest({
      kind: "mandarin_vocabulary",
      action: "cancel_all",
      cards: [],
      ignore_keys: ["稀有"],
    });
    await persistDeckSetup({
      kind: "mandarin_vocabulary",
      deck_name: "Vocab",
      model_name: "Model",
      fields: { writting: "a", pinyin: "b", definition: "c" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws with backend error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "nope" }),
      }),
    );

    await expect(fetchSyncData("mandarin_vocabulary")).rejects.toThrow("nope");
  });
});
