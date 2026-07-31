import { fetchTokenUsage } from "./tokenUsageApi";

describe("tokenUsageApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads token usage summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            total_tokens: 42,
            total_cost_usd: 0.00015,
            plan: "free",
            available_token: 99958,
            max_allowed_token: 100000,
            days: [{ date: "2026-07-24", tokens: 42 }],
          }),
        }),
      ),
    );

    await expect(fetchTokenUsage()).resolves.toEqual({
      total_tokens: 42,
      total_cost_usd: 0.00015,
      plan: "free",
      available_token: 99958,
      max_allowed_token: 100000,
      days: [{ date: "2026-07-24", tokens: 42 }],
    });
  });
});
