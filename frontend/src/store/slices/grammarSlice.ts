import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GrammarPoint } from "../../types/grammarPoint";
import type { WritingTopic } from "../../types/writingTopic";
import { resetAppData } from "../thunks/syncAppData";

export type GrammarState = {
  items: GrammarPoint[];
  writingPractices: WritingTopic[];
  loaded: boolean;
  quizInProgress: boolean;
};

const initialState: GrammarState = {
  items: [],
  writingPractices: [],
  loaded: false,
  quizInProgress: false,
};

const grammarSlice = createSlice({
  name: "grammar",
  initialState,
  reducers: {
    setGrammarData(
      state,
      action: PayloadAction<{ grammarPoints: GrammarPoint[]; writingPractices: WritingTopic[] }>,
    ) {
      state.items = action.payload.grammarPoints;
      state.writingPractices = action.payload.writingPractices;
      state.loaded = true;
    },
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
  setGrammarData,
  setGrammarPoints,
  setGrammarPointStatus,
  setGrammarPointScore,
  setGrammarQuizInProgress,
} = grammarSlice.actions;
export default grammarSlice.reducer;
