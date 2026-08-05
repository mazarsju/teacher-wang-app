import { describe, expect, it } from "vitest";
import { buildImportFileContent } from "./buildImportLines";

describe("buildImportFileContent", () => {
  it("splits each character with its aligned pinyin syllable and tone", () => {
    const content = buildImportFileContent([
      { word: "爱好", pinyin: "ai4 hao4", definition: "hobby", knownToWrite: true },
    ]);

    expect(content.split("\n").sort()).toEqual([
      "好;hao;4;true;爱好",
      "爱;ai;4;true;爱好",
    ]);
  });

  it("handles neutral-tone syllables with no trailing digit", () => {
    const content = buildImportFileContent([
      { word: "的", pinyin: "de", definition: "of", knownToWrite: false },
    ]);

    expect(content).toBe("的;de;;false;的");
  });

  it("merges a character shared by multiple words and ORs the known flag", () => {
    const content = buildImportFileContent([
      { word: "爱", pinyin: "ai4", definition: "to love", knownToWrite: false },
      { word: "爱好", pinyin: "ai4 hao4", definition: "hobby", knownToWrite: true },
    ]);

    const lines = content.split("\n");
    const aiLine = lines.find((line) => line.startsWith("爱;"));

    expect(aiLine).toBe("爱;ai;4;true;爱,爱好");
  });
});
