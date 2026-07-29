import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autoSetupVocabularyDeck,
  fetchAnkiDecks,
  fetchAnkiModelFields,
  fetchAnkiModels,
  setupAnkiDeck,
} from "./ankiSetup";

vi.mock("./ankiConnect", () => ({
  createDeck: vi.fn(),
  createModel: vi.fn(),
  deckNames: vi.fn(),
  modelFieldNames: vi.fn(),
  modelNames: vi.fn(),
}));

vi.mock("./ankiDbClient", () => ({
  persistDeckSetup: vi.fn(),
}));

import {
  createDeck,
  createModel,
  deckNames,
  modelFieldNames,
  modelNames,
} from "./ankiConnect";
import { persistDeckSetup } from "./ankiDbClient";

const mockDeckNames = vi.mocked(deckNames);
const mockModelNames = vi.mocked(modelNames);
const mockModelFieldNames = vi.mocked(modelFieldNames);
const mockCreateDeck = vi.mocked(createDeck);
const mockCreateModel = vi.mocked(createModel);
const mockPersist = vi.mocked(persistDeckSetup);

describe("ankiSetup", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetchAnkiDecks/Models/Fields delegate to AnkiConnect", async () => {
    mockDeckNames.mockResolvedValue(["A"]);
    mockModelNames.mockResolvedValue(["Basic"]);
    mockModelFieldNames.mockResolvedValue(["Front"]);

    await expect(fetchAnkiDecks()).resolves.toEqual(["A"]);
    await expect(fetchAnkiModels()).resolves.toEqual(["Basic"]);
    await expect(fetchAnkiModelFields("Basic")).resolves.toEqual(["Front"]);
  });

  it("setupAnkiDeck validates against Anki then persists mapping", async () => {
    mockDeckNames.mockResolvedValue(["Vocab"]);
    mockModelNames.mockResolvedValue(["Model"]);
    mockModelFieldNames.mockResolvedValue(["Hanzi", "Reading", "Meaning"]);
    mockPersist.mockResolvedValue({
      kind: "mandarin_vocabulary",
      deck: {
        status: "synchronized",
        deck_name: "Vocab",
        model_name: "Model",
        fields: {
          writting: "Hanzi",
          pinyin: "Reading",
          definition: "Meaning",
        },
      },
    });

    await setupAnkiDeck({
      kind: "mandarin_vocabulary",
      deckName: "Vocab",
      modelName: "Model",
      fields: {
        writting: "Hanzi",
        pinyin: "Reading",
        definition: "Meaning",
      },
    });

    expect(mockPersist).toHaveBeenCalled();
  });

  it("setupAnkiDeck creates deck when create is true", async () => {
    mockModelNames.mockResolvedValue(["Model"]);
    mockModelFieldNames.mockResolvedValue(["Front", "Back"]);
    mockPersist.mockResolvedValue({
      kind: "mandarin_writting",
      deck: {
        status: "synchronized",
        deck_name: "New",
        model_name: "Model",
        fields: { recto: "Front", verso: "Back" },
      },
    });

    await setupAnkiDeck({
      kind: "mandarin_writting",
      deckName: "New",
      modelName: "Model",
      fields: { recto: "Front", verso: "Back" },
      create: true,
    });

    expect(mockCreateDeck).toHaveBeenCalledWith("New");
  });

  it("autoSetupVocabularyDeck creates model and deck", async () => {
    mockModelNames.mockResolvedValue([]);
    mockCreateModel.mockResolvedValue(null);
    mockCreateDeck.mockResolvedValue(null);

    const result = await autoSetupVocabularyDeck({
      deckName: "Vocab",
      modelName: "3dir",
    });

    expect(mockCreateModel).toHaveBeenCalled();
    expect(mockCreateDeck).toHaveBeenCalledWith("Vocab");
    expect(result.deck.deck_name).toBe("Vocab");
  });
});
