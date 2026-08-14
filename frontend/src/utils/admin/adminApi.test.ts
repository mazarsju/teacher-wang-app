import {
  deleteUser,
  fetchUsers,
  generateArticles,
  updateUserPlan,
} from "./adminApi";

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

  it("deletes a user", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteUser("1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws when deleting a user fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));

    await expect(deleteUser("1")).rejects.toThrow("Failed to delete user.");
  });

  it("generates articles", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateArticles()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/articles/generate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when generating articles fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));

    await expect(generateArticles()).rejects.toThrow(
      "Failed to refresh articles.",
    );
  });
});
