import { describe, expect, it } from "vitest";
import {
  buildAnkiNotes,
  characterIdsFromVerso,
  significantAnkiVersos,
  syncMarkIdsForCards,
} from "./ankiNotes";

describe("characterIdsFromVerso", () => {
  it("extracts Han characters before dash annotations", () => {
    expect(characterIdsFromVerso("你好-note")).toEqual(["你", "好"]);
  });
});

describe("significantAnkiVersos", () => {
  it("normalizes verso keys", () => {
    expect(significantAnkiVersos(new Set(["水-x", "火", ""])) ).toEqual(
      new Set(["水", "火"]),
    );
  });
});

describe("syncMarkIdsForCards", () => {
  it("uses card ids for vocabulary", () => {
    expect(
      syncMarkIdsForCards("mandarin_vocabulary", [
        { id: "水", writting: "水", pinyin: "shui3", definition: "water" },
      ]),
    ).toEqual(["水"]);
  });

  it("expands writting versos into character ids", () => {
    expect(
      syncMarkIdsForCards("mandarin_writting", [
        { id: "hello (ni3 hao3)", recto: "hello (ni3 hao3)", verso: "你好" },
      ]),
    ).toEqual(["你", "好"]);
  });
});

describe("buildAnkiNotes", () => {
  it("maps vocabulary fields and tags notes", () => {
    expect(
      buildAnkiNotes({
        kind: "mandarin_vocabulary",
        deckName: "Vocab",
        modelName: "Model",
        fieldMap: {
          writting: "Hanzi",
          pinyin: "Reading",
          definition: "Meaning",
        },
        cards: [
          {
            id: "水",
            writting: "水",
            pinyin: "shui3",
            definition: "water",
          },
        ],
      }),
    ).toEqual([
      {
        deckName: "Vocab",
        modelName: "Model",
        fields: {
          Hanzi: "水",
          Reading: "shui3",
          Meaning: "water",
        },
        options: { allowDuplicate: true },
        tags: ["teacher-wang"],
      },
    ]);
  });
});
