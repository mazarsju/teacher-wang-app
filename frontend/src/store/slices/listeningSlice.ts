import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ListeningPracticesResult } from "../../types/listeningPractice";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type ListeningState = {
  items: ListeningPracticesResult["practices"];
  currentHskLevel: number;
  loaded: boolean;
};

const initialState: ListeningState = {
  items: [],
  currentHskLevel: 1,
  loaded: false,
};

const listeningSlice = createSlice({
  name: "listening",
  initialState,
  reducers: {
    setListeningPractices(state, action: PayloadAction<ListeningPracticesResult>) {
      state.items = action.payload.practices;
      state.currentHskLevel = action.payload.currentHskLevel;
      state.loaded = true;
    },
    setListeningPracticeResult(
      state,
      action: PayloadAction<{
        id: string;
        status: string;
        vocabulary_score: number;
        grammar_score: number;
      }>,
    ) {
      const practice = state.items.find((item) => item.id === action.payload.id);
      if (practice) {
        practice.status = action.payload.status;
        practice.vocabulary_score = action.payload.vocabulary_score;
        practice.grammar_score = action.payload.grammar_score;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.fulfilled, (state, action) => {
        state.items = action.payload.listeningPractices.practices;
        state.currentHskLevel = action.payload.listeningPractices.currentHskLevel;
        state.loaded = true;
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const { setListeningPractices, setListeningPracticeResult } =
  listeningSlice.actions;
export default listeningSlice.reducer;
