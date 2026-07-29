import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnkiConnectError,
  deckNames,
  invoke,
  isConnected,
} from "./ankiConnect";

describe("ankiConnect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("invoke returns result from AnkiConnect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ result: ["Default"], error: null }),
      }),
    );

    await expect(invoke("deckNames")).resolves.toEqual(["Default"]);
  });

  it("invoke raises on Anki error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ result: null, error: "unsupported action" }),
      }),
    );

    await expect(invoke("deckNames")).rejects.toBeInstanceOf(AnkiConnectError);
  });

  it("invoke raises when AnkiConnect is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(invoke("deckNames")).rejects.toThrow(/unreachable/i);
  });

  it("deckNames and isConnected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ result: ["A", "B"], error: null }),
      }),
    );

    await expect(deckNames()).resolves.toEqual(["A", "B"]);
    await expect(isConnected()).resolves.toBe(true);
  });

  it("isConnected returns false when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(isConnected()).resolves.toBe(false);
  });
});
