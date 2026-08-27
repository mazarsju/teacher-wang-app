import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WeeklyArticle } from "../../utils/knowledgeBase/weeklyArticleApi";
import { resetAppData } from "../thunks/syncAppData";

export type WeeklyArticleState = {
  article: WeeklyArticle | null;
  loaded: boolean;
};

const initialState: WeeklyArticleState = {
  article: null,
  loaded: false,
};

const weeklyArticleSlice = createSlice({
  name: "weeklyArticle",
  initialState,
  reducers: {
    setWeeklyArticle(state, action: PayloadAction<WeeklyArticle>) {
      state.article = action.payload;
      state.loaded = true;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAppData, () => initialState);
  },
});

export const { setWeeklyArticle } = weeklyArticleSlice.actions;
export default weeklyArticleSlice.reducer;
