import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { HskLevelStatus } from "../../utils/knowledgeBase/hskLevelApi";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type HskState = {
  status: HskLevelStatus | null;
};

const initialState: HskState = {
  status: null,
};

const hskSlice = createSlice({
  name: "hsk",
  initialState,
  reducers: {
    setHskLevelStatus(state, action: PayloadAction<HskLevelStatus | null>) {
      state.status = action.payload;
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

export const { setHskLevelStatus } = hskSlice.actions;
export default hskSlice.reducer;
