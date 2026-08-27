import { describe, expect, it } from "vitest";
import { splitIntoSentences } from "./splitSentences";

describe("splitIntoSentences", () => {
  it("splits Chinese punctuation into separate sentences", () => {
    expect(splitIntoSentences("我叫小明。我今年二十岁！你呢？")).toEqual([
      { paragraphIndex: 0, text: "我叫小明。" },
      { paragraphIndex: 0, text: "我今年二十岁！" },
      { paragraphIndex: 0, text: "你呢？" },
    ]);
  });

  it("splits English punctuation into separate sentences", () => {
    expect(splitIntoSentences("Hello there. How are you? I am fine!")).toEqual([
      { paragraphIndex: 0, text: "Hello there." },
      { paragraphIndex: 0, text: "How are you?" },
      { paragraphIndex: 0, text: "I am fine!" },
    ]);
  });

  it("groups sentences by their line and skips blank lines", () => {
    expect(splitIntoSentences("我叫小明。\n\n我喜欢打篮球。我也喜欢看书。")).toEqual([
      { paragraphIndex: 0, text: "我叫小明。" },
      { paragraphIndex: 1, text: "我喜欢打篮球。" },
      { paragraphIndex: 1, text: "我也喜欢看书。" },
    ]);
  });

  it("keeps a trailing sentence with no ending punctuation", () => {
    expect(splitIntoSentences("我叫小明")).toEqual([
      { paragraphIndex: 0, text: "我叫小明" },
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(splitIntoSentences("   \n  \n ")).toEqual([]);
  });
});
