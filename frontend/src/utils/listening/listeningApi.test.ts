import {
  completeListeningPractice,
  fetchListeningAudioBlob,
  fetchListeningAudioSegmentBlob,
  fetchListeningPracticeDetail,
  fetchListeningPracticesForLevel,
  fetchListeningPracticesLight,
  transcribeListeningAudio,
} from "./listeningApi";

describe("listeningApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the catalog fields for every listening topic when no max level is given", async () => {
    const fetchMock = vi.fn(() =>
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
              translated_topic: "family",
            },
          ],
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchListeningPracticesLight()).resolves.toEqual([
      {
        id: "listening-family-size",
        title: "How many are in your family?",
        hsk_level: 1,
        type: "dialog",
        topic: "family",
        translated_topic: "family",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices-light",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends max_hsk_level as a query param when given", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ listening_practices: [] }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchListeningPracticesLight(3);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices-light?max_hsk_level=3",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when the light listening practices request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(fetchListeningPracticesLight()).rejects.toThrow(
      "Failed to load listening practices.",
    );
  });

  it("loads a single HSK level's per-user listening practice data", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          listening_practices: [
            {
              id: "listening-family-size",
              status: "DONE",
              vocabulary_score: 80,
              grammar_score: 50,
            },
          ],
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchListeningPracticesForLevel(1)).resolves.toEqual([
      {
        id: "listening-family-size",
        status: "DONE",
        vocabulary_score: 80,
        grammar_score: 50,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listening-practices/1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws when the per-level listening practices request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })),
    );

    await expect(fetchListeningPracticesForLevel(1)).rejects.toThrow(
      "Failed to load listening practices.",
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
      segment_ids: [1],
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

  it("sends the expected sentence as a hint to bias the transcription", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ text: "坐几号车" }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await transcribeListeningAudio(
      new Blob(["voice"], { type: "audio/webm" }),
      "坐几号车",
    );

    const [, init] = fetchMock.mock.calls[0];
    const formData = init.body as FormData;
    expect(formData.get("expected_text")).toBe("坐几号车");
  });

  it("omits the expected_text field when no hint is given", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ text: "你好" }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await transcribeListeningAudio(new Blob(["voice"], { type: "audio/webm" }));

    const [, init] = fetchMock.mock.calls[0];
    const formData = init.body as FormData;
    expect(formData.has("expected_text")).toBe(false);
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
