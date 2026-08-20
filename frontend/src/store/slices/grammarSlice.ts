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
    setGrammarPointStatus(
      state,
      action: PayloadAction<{ id: string; status: string }>,
    ) {
      const point = state.items.find((item) => item.id === action.payload.id);
      if (point) {
        point.status = action.payload.status;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAppData, () => initialState);
  },
});

export const { setGrammarPoints, setGrammarPointStatus } = grammarSlice.actions;
export default grammarSlice.reducer;
