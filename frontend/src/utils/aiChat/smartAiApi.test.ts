import { fetchSmartAiPreference, updateSmartAiPreference } from "./smartAiApi";

describe("smartAiApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the smart AI preference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ enabled: true }),
        }),
      ),
    );

    await expect(fetchSmartAiPreference()).resolves.toEqual({ enabled: true });
  });

  it("throws when loading the preference fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(fetchSmartAiPreference()).rejects.toThrow(
      "Failed to load the Smart AI preference.",
    );
  });

  it("updates the smart AI preference", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ enabled: false }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateSmartAiPreference(false)).resolves.toEqual({
      enabled: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/preferences/smart-ai"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
    );
  });

  it("throws when updating the preference fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(updateSmartAiPreference(true)).rejects.toThrow(
      "Failed to update the Smart AI preference.",
    );
  });
});
