import { resetAppData } from "../thunks/syncAppData";
import reducer, {
  setGrammarPointScore,
  setGrammarPointStatus,
  setGrammarPoints,
  setGrammarQuizInProgress,
} from "./grammarSlice";

const SAMPLE_POINT = {
  id: "1|Basic Sentence Structure",
  hsk_level: 1,
  title: "Basic Sentence Structure",
  prerequisites: [],
  status: "TODO",
  score: null,
};

describe("grammarSlice", () => {
  it("starts with no grammar points", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      items: [],
      quizInProgress: false,
    });
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

  it("updates a single grammar point's status and score", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    const state = reducer(
      populated,
      setGrammarPointScore({ id: SAMPLE_POINT.id, status: "DONE", score: 82 }),
    );

    expect(state.items).toEqual([{ ...SAMPLE_POINT, status: "DONE", score: 82 }]);
  });

  it("tracks whether a quiz is in progress", () => {
    const state = reducer(undefined, setGrammarQuizInProgress(true));

    expect(state.quizInProgress).toBe(true);
  });

  it("clears on resetAppData", () => {
    const populated = reducer(undefined, setGrammarPoints([SAMPLE_POINT]));

    expect(reducer(populated, resetAppData())).toEqual({
      items: [],
      quizInProgress: false,
    });
  });
});
