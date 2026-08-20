import { resetAppData } from "../thunks/syncAppData";
import reducer, { setGrammarPoints } from "./grammarSlice";

const SAMPLE_POINT = {
  id: "1|Basic Sentence Structure",
  hsk_level: 1,
  title: "Basic Sentence Structure",
  prerequisites: [],
  status: "TODO",
};

describe("grammarSlice", () => {
  it("starts with no grammar points", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({ items: [] });
  });

  it("stores the fetched grammar points", () => {
    const state = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    expect(state.items).toEqual([SAMPLE_POINT]);
  });

  it("clears on resetAppData", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    expect(reducer(populated, resetAppData())).toEqual({ items: [] });
  });
});
