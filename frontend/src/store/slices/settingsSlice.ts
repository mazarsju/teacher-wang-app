import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LlmConfig } from "../../types/llmConfig";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type SettingsState = {
  llmConfig: LlmConfig;
};

const emptyLlmConfig: LlmConfig = {
  LLM_API_KEY: "",
  LLM_MODEL: "",
};

const initialState: SettingsState = {
  llmConfig: emptyLlmConfig,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setLlmConfig(state, action: PayloadAction<LlmConfig>) {
      state.llmConfig = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.fulfilled, (state, action) => {
        state.llmConfig = action.payload.settings;
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const { setLlmConfig } = settingsSlice.actions;
export default settingsSlice.reducer;
