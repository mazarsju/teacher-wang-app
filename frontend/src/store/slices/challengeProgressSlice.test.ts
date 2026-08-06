import { resetAppData, resetKnowledgeBaseData } from "../thunks/syncAppData";
import reducer, { setChallengeProgress } from "./challengeProgressSlice";

describe("challengeProgressSlice", () => {
  it("starts with no completed challenges", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      completedIds: [],
    });
  });

  it("stores the completed challenge ids", () => {
    const state = reducer(
      undefined,
      setChallengeProgress(["challenge-restaurant", "challenge-taxi"]),
    );

    expect(state.completedIds).toEqual(["challenge-restaurant", "challenge-taxi"]);
  });

  it("clears on resetKnowledgeBaseData", () => {
    const populated = reducer(
      undefined,
      setChallengeProgress(["challenge-restaurant"]),
    );

    expect(reducer(populated, resetKnowledgeBaseData())).toEqual({
      completedIds: [],
    });
  });

  it("clears on resetAppData", () => {
    const populated = reducer(
      undefined,
      setChallengeProgress(["challenge-restaurant"]),
    );

    expect(reducer(populated, resetAppData())).toEqual({ completedIds: [] });
  });
});
