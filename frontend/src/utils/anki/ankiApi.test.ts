import { describe, expect, it } from "vitest";
import * as ankiApi from "./ankiApi";

describe("ankiApi facade", () => {
  it("re-exports the public Anki helpers", () => {
    expect(typeof ankiApi.fetchAnkiStatus).toBe("function");
    expect(typeof ankiApi.fetchAnkiDecks).toBe("function");
    expect(typeof ankiApi.fetchAnkiModels).toBe("function");
    expect(typeof ankiApi.fetchAnkiModelFields).toBe("function");
    expect(typeof ankiApi.setupAnkiDeck).toBe("function");
    expect(typeof ankiApi.autoSetupVocabularyDeck).toBe("function");
    expect(typeof ankiApi.fetchAnkiPendingSync).toBe("function");
    expect(typeof ankiApi.runAnkiSync).toBe("function");
    expect(typeof ankiApi.runAnkiQuickSync).toBe("function");
  });
});
