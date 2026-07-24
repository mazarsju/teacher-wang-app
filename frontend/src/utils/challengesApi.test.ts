import { fetchChallengesProgress } from "./challengesApi";

describe("challengesApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads challenges progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            challenges: [{ id: "challenge-restaurant", completed: true }],
          }),
        }),
      ),
    );

    await expect(fetchChallengesProgress()).resolves.toEqual({
      challenges: [{ id: "challenge-restaurant", completed: true }],
    });
  });
});
