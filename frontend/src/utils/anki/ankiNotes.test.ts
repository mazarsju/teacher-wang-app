import { describe, expect, it } from "vitest";
import {
  buildAnkiNotes,
  significantAnkiVersos,
  syncMarkIdsForCards,
} from "./ankiNotes";

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
        { id: "水", writing: "水", pinyin: "shui3", definition: "water" },
      ]),
    ).toEqual(["水"]);
  });

  it("uses card ids for writing", () => {
    expect(
      syncMarkIdsForCards("mandarin_writing", [
        { id: "你好", recto: "hello (ni3 hao3)", verso: "你好" },
      ]),
    ).toEqual(["你好"]);
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
          writing: "Hanzi",
          pinyin: "Reading",
          definition: "Meaning",
        },
        cards: [
          {
            id: "水",
            writing: "水",
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
        options: { allowDuplicate: false },
        tags: ["teacher-wang"],
      },
    ]);
  });

  it("maps custom field values onto their configured Anki field", () => {
    const notes = buildAnkiNotes({
      kind: "mandarin_vocabulary",
      deckName: "Vocab",
      modelName: "Model",
      fieldMap: {
        writing: "Hanzi",
        pinyin: "Reading",
        definition: "Meaning",
      },
      customFields: [
        {
          id: "example-sentence",
          title: "Example sentence",
          description: "",
          anki_field: "Example",
        },
        { id: "unmapped", title: "Unmapped", description: "", anki_field: "" },
      ],
      cards: [
        {
          id: "水",
          writing: "水",
          pinyin: "shui3",
          definition: "water",
          custom_fields: { "example-sentence": "水很好喝" },
        },
      ],
    });

    expect(notes[0].fields).toEqual({
      Hanzi: "水",
      Reading: "shui3",
      Meaning: "water",
      Example: "水很好喝",
    });
  });
});
