import { resetAppData } from "../thunks/syncAppData";
import reducer, { setGrammarPointStatus, setGrammarPoints } from "./grammarSlice";

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

  it("updates a single grammar point's status", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    const state = reducer(
      populated,
      setGrammarPointStatus({ id: SAMPLE_POINT.id, status: "SKIP" }),
    );

    expect(state.items).toEqual([{ ...SAMPLE_POINT, status: "SKIP" }]);
  });

  it("ignores a status update for an unknown grammar point id", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    const state = reducer(
      populated,
      setGrammarPointStatus({ id: "unknown", status: "SKIP" }),
    );

    expect(state.items).toEqual([SAMPLE_POINT]);
  });

  it("clears on resetAppData", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    expect(reducer(populated, resetAppData())).toEqual({ items: [] });
  });
});
