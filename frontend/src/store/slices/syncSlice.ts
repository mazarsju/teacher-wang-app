import { createSlice } from "@reduxjs/toolkit";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type SyncStatus = "idle" | "loading" | "succeeded" | "failed";

export type SyncState = {
  status: SyncStatus;
  error: string | null;
  lastSyncedAt: string | null;
};

const initialState: SyncState = {
  status: "idle",
  error: null,
  lastSyncedAt: null,
};

const syncSlice = createSlice({
  name: "sync",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(syncAppData.fulfilled, (state) => {
        state.status = "succeeded";
        state.error = null;
        state.lastSyncedAt = new Date().toISOString();
      })
      .addCase(syncAppData.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to synchronize data.";
      })
      .addCase(resetAppData, () => initialState);
  },
});

export default syncSlice.reducer;
