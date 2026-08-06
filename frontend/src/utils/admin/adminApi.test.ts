import { fetchUsers, updateUserPlan } from "./adminApi";

describe("adminApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the user list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            users: [{ id: "1", email: "a@example.com", plan: "free" }],
          }),
        }),
      ),
    );

    await expect(fetchUsers()).resolves.toEqual([
      { id: "1", email: "a@example.com", plan: "free" },
    ]);
  });

  it("throws when loading users fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(fetchUsers()).rejects.toThrow("Failed to load users.");
  });

  it("updates a user's plan", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ id: "1", email: "a@example.com", plan: "pro" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateUserPlan("1", "pro")).resolves.toEqual({
      id: "1",
      email: "a@example.com",
      plan: "pro",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ plan: "pro" }),
      }),
    );
  });

  it("throws when updating a user fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(updateUserPlan("1", "pro")).rejects.toThrow(
      "Failed to update user.",
    );
  });
});
