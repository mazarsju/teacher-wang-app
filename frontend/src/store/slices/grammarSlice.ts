import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GrammarPoint } from "../../types/grammarPoint";
import { resetAppData } from "../thunks/syncAppData";

export type GrammarState = {
  items: GrammarPoint[];
};

const initialState: GrammarState = {
  items: [],
};

const grammarSlice = createSlice({
  name: "grammar",
  initialState,
  reducers: {
    setGrammarPoints(state, action: PayloadAction<GrammarPoint[]>) {
      state.items = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAppData, () => initialState);
  },
});

export const { setGrammarPoints } = grammarSlice.actions;
export default grammarSlice.reducer;
