import { resetAppData } from "../thunks/syncAppData";
import reducer, { setWeeklyArticle } from "./weeklyArticleSlice";

const SAMPLE_ARTICLE = {
  week: 33,
  year: 2026,
  hsk_level: 2,
  content: [{ title: "第一篇", content: "你好" }],
};

describe("weeklyArticleSlice", () => {
  it("starts with no article", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual({
      article: null,
      loaded: false,
    });
  });

  it("stores the fetched article and marks it loaded", () => {
    const state = reducer(undefined, setWeeklyArticle(SAMPLE_ARTICLE));

    expect(state.article).toEqual(SAMPLE_ARTICLE);
    expect(state.loaded).toBe(true);
  });

  it("clears on resetAppData", () => {
    const populated = reducer(undefined, setWeeklyArticle(SAMPLE_ARTICLE));

    expect(reducer(populated, resetAppData())).toEqual({
      article: null,
      loaded: false,
    });
  });
});
