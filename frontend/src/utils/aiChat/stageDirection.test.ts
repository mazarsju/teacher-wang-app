import {
  getStageDirectionLines,
  parseMessageSegments,
} from "./stageDirection";

describe("parseMessageSegments", () => {
  it("extracts stage directions from anywhere in the message", () => {
    expect(
      parseMessageSegments(
        "[[The waiter leaves]][[The waiter comes back]]您的菜来了。",
      ),
    ).toEqual([
      { type: "stage", text: "The waiter leaves" },
      { type: "stage", text: "The waiter comes back" },
      { type: "text", text: "您的菜来了。" },
    ]);
  });

  it("keeps only stage segments when the message is all brackets", () => {
    expect(parseMessageSegments("[[A]][[B]][[C]]")).toEqual([
      { type: "stage", text: "A" },
      { type: "stage", text: "B" },
      { type: "stage", text: "C" },
    ]);
  });

  it("returns a single text segment when there are no stage directions", () => {
    expect(parseMessageSegments("您好，请问需要什么？")).toEqual([
      { type: "text", text: "您好，请问需要什么？" },
    ]);
  });

  it("ignores empty and single-bracket forms", () => {
    expect(parseMessageSegments("[[]]")).toEqual([]);
    expect(parseMessageSegments("[The waiter leaves]")).toEqual([
      { type: "text", text: "[The waiter leaves]" },
    ]);
  });
});

describe("getStageDirectionLines", () => {
  it("returns all stage lines found anywhere in the message", () => {
    expect(getStageDirectionLines("[[The waiter leaves]]")).toEqual([
      "The waiter leaves",
    ]);
    expect(getStageDirectionLines("say [[this]] aloud")).toEqual(["this"]);
    expect(
      getStageDirectionLines("[[A]] hello [[B]]"),
    ).toEqual(["A", "B"]);
    expect(getStageDirectionLines("您好")).toBeNull();
    expect(getStageDirectionLines("[The waiter leaves]")).toBeNull();
  });
});
