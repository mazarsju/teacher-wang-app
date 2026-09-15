import {
  completeListeningPractice,
  fetchListeningAudioBlob,
  fetchListeningAudioSegmentBlob,
  fetchListeningPracticeDetail,
  fetchListeningPractices,
  refreshListeningPractices,
  transcribeListeningAudio,
} from "./listeningApi";

describe("listeningApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the listening practices list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            listening_practices: [
              {
                id: "listening-family-size",
                title: "How many are in your family?",
                hsk_level: 1,
                type: "dialog",
                topic: "family",
                status: "TODO",
                vocabulary_score: 0,
                grammar_score: 0,
              },
            ],
            current_hsk_level: 2,
          }),
        }),
      ),
    );

    await expect(fetchListeningPractices()).resolves.toEqual({
      practices: [
        {
          id: "listening-family-size",
          title: "How many are in your family?",
          hsk_level: 1,
          type: "dialog",
          topic: "family",
          status: "TODO",
          vocabulary_score: 0,
          grammar_score: 0,
        },
      ],
      currentHskLevel: 2,
    });
  });

  it("throws when loading listening practices fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(fetchListeningPractices()).rejects.toThrow(
      "Failed to load listening practices.",
    );
  });

  it("refreshes listening practices", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshListeningPractices()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when refreshing listening practices fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));

    await expect(refreshListeningPractices()).rejects.toThrow(
      "Failed to refresh listening practices.",
    );
  });

  it("loads a listening practice's detail", async () => {
    const detail = {
      id: "listening-family-size",
      title: "How many are in your family?",
      hsk_level: 1,
      type: "dialog",
      topic: "family",
      status: "TODO",
      vocabulary_score: 0,
      grammar_score: 0,
      text: "你家有几个人？",
      sentences: [{ id: 1, mandarin: "你家有几个人？", translation: "..." }],
      segment_count: 1,
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => detail }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchListeningPracticeDetail("listening-family-size"),
    ).resolves.toEqual(detail);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices/listening-family-size",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when loading a listening practice's detail fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(
      fetchListeningPracticeDetail("listening-family-size"),
    ).rejects.toThrow("Failed to load the listening practice.");
  });

  it("loads the full audio blob", async () => {
    const blob = new Blob(["audio"], { type: "audio/mpeg" });
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, blob: async () => blob }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchListeningAudioBlob("listening-family-size"),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices/listening-family-size/audio",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when loading the full audio blob fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));

    await expect(
      fetchListeningAudioBlob("listening-family-size"),
    ).rejects.toThrow("Failed to load the audio.");
  });

  it("loads a segment audio blob", async () => {
    const blob = new Blob(["segment"], { type: "audio/mpeg" });
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, blob: async () => blob }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchListeningAudioSegmentBlob("listening-family-size", 2),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices/listening-family-size/audio/2",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("transcribes recorded audio via the chat STT endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ text: "你好" }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeListeningAudio(new Blob(["voice"], { type: "audio/webm" })),
    ).resolves.toBe("你好");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/stt",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws with the server's error message when transcription fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: "No audio file provided" }),
        }),
      ),
    );

    await expect(
      transcribeListeningAudio(new Blob(["voice"], { type: "audio/webm" })),
    ).rejects.toThrow("No audio file provided");
  });

  it("saves the learner's completion choice", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          status: "DONE",
          vocabulary_score: 40,
          grammar_score: 60,
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeListeningPractice("listening-family-size", true),
    ).resolves.toEqual({
      status: "DONE",
      vocabulary_score: 40,
      grammar_score: 60,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices/listening-family-size/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ completed: true }),
      }),
    );
  });

  it("throws when saving the completion choice fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));

    await expect(
      completeListeningPractice("listening-family-size", true),
    ).rejects.toThrow("Failed to save the completion status.");
  });
});
