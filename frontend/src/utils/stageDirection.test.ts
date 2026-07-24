import { getStageDirectionText } from "./stageDirection";

describe("getStageDirectionText", () => {
  it("extracts text from a bracketed stage direction", () => {
    expect(getStageDirectionText("[The waiter leaves]")).toBe(
      "The waiter leaves",
    );
    expect(
      getStageDirectionText("  [The waiter needs to be called to come]  "),
    ).toBe("The waiter needs to be called to come");
  });

  it("returns null for normal dialogue", () => {
    expect(getStageDirectionText("您好，请问需要什么？")).toBeNull();
    expect(getStageDirectionText("[partial")).toBeNull();
    expect(getStageDirectionText("say [this] aloud")).toBeNull();
    expect(getStageDirectionText("[]")).toBeNull();
  });
});
