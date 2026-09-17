import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { HskLevelStatus } from "../../utils/knowledgeBase/hskLevelApi";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type HskState = {
  status: HskLevelStatus | null;
  // The cheap, persisted level from GET /hsk-level-light: fetched once right
  // after login by loadGrammarData/loadListeningData (each independently —
  // see their own comments on why this isn't deduped into a single shared
  // fetch) and never refetched, unlike `status` above which is recomputed by
  // the heavier GET /hsk-level.
  currentLevelLight: number | null;
};

const initialState: HskState = {
  status: null,
  currentLevelLight: null,
};

const hskSlice = createSlice({
  name: "hsk",
  initialState,
  reducers: {
    setHskLevelStatus(state, action: PayloadAction<HskLevelStatus | null>) {
      state.status = action.payload;
    },
    setHskLevelLight(state, action: PayloadAction<number | null>) {
      state.currentLevelLight = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.fulfilled, (state, action) => {
        state.status = action.payload.hskLevel;
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const { setHskLevelStatus, setHskLevelLight } = hskSlice.actions;
export default hskSlice.reducer;
