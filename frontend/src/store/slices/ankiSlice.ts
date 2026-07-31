import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { emptyAnkiStatus, type AnkiStatus } from "../../types/anki";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type AnkiState = {
  status: AnkiStatus;
};

const initialState: AnkiState = {
  status: emptyAnkiStatus,
};

const ankiSlice = createSlice({
  name: "anki",
  initialState,
  reducers: {
    setAnkiStatus(state, action: PayloadAction<AnkiStatus>) {
      state.status = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.fulfilled, (state, action) => {
        state.status = action.payload.ankiStatus;
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const { setAnkiStatus } = ankiSlice.actions;
export default ankiSlice.reducer;
