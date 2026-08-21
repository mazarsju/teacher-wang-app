import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GrammarPoint } from "../../types/grammarPoint";
import { resetAppData } from "../thunks/syncAppData";

export type GrammarState = {
  items: GrammarPoint[];
  quizInProgress: boolean;
};

const initialState: GrammarState = {
  items: [],
  quizInProgress: false,
};

const grammarSlice = createSlice({
  name: "grammar",
  initialState,
  reducers: {
    setGrammarPoints(state, action: PayloadAction<GrammarPoint[]>) {
      state.items = action.payload;
    },
    setGrammarPointStatus(
      state,
      action: PayloadAction<{ id: string; status: string }>,
    ) {
      const point = state.items.find((item) => item.id === action.payload.id);
      if (point) {
        point.status = action.payload.status;
      }
    },
    setGrammarPointScore(
      state,
      action: PayloadAction<{ id: string; status: string; score: number }>,
    ) {
      const point = state.items.find((item) => item.id === action.payload.id);
      if (point) {
        point.status = action.payload.status;
        point.score = action.payload.score;
      }
    },
    setGrammarQuizInProgress(state, action: PayloadAction<boolean>) {
      state.quizInProgress = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAppData, () => initialState);
  },
});

export const {
  setGrammarPoints,
  setGrammarPointStatus,
  setGrammarPointScore,
  setGrammarQuizInProgress,
} = grammarSlice.actions;
export default grammarSlice.reducer;
