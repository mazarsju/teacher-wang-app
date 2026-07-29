import { clearChatHistory, fetchChatHistory, sendChatMessage } from "./chatApi";

describe("chatApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads chat history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [{ role: "user", content: "Hello" }],
          }),
        }),
      ),
    );

    await expect(fetchChatHistory("teacher-wang")).resolves.toEqual({
      messages: [{ role: "user", content: "Hello" }],
      completedTaskIds: [],
    });
  });

  it("loads challenge chat history with completed tasks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            messages: [{ role: "user", content: "服务员" }],
            completed_task_ids: ["call-waiter"],
          }),
        }),
      ),
    );

    await expect(fetchChatHistory("challenge-restaurant")).resolves.toEqual({
      messages: [{ role: "user", content: "服务员" }],
      completedTaskIds: ["call-waiter"],
    });
  });

  it("sends a chat message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            message: { role: "assistant", content: "你好" },
          }),
        }),
      ),
    );

    await expect(
      sendChatMessage("teacher-wang", [{ role: "user", content: "Hello" }]),
    ).resolves.toEqual({
      message: { role: "assistant", content: "你好" },
    });
  });

  it("sends a chat message in a parent correction thread", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "Because 是 is wrong here." },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendChatMessage(
        "teacher-wang",
        [{ role: "user", content: "Why?" }],
        { parentCharacterId: "xiao-ming", threadId: "thread123" },
      ),
    ).resolves.toEqual({
      message: {
        role: "assistant",
        content: "Because 是 is wrong here.",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        character_id: "teacher-wang",
        messages: [{ role: "user", content: "Why?" }],
        parent_character_id: "xiao-ming",
        thread_id: "thread123",
      }),
    });
  });

  it("clears chat history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ message: "Chat history cleared" }),
        }),
      ),
    );

    await expect(clearChatHistory("teacher-wang")).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("/api/chat/history/teacher-wang", {
      method: "DELETE",
    });
  });
});
