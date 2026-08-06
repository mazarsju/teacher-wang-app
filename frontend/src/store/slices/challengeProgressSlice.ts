import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { resetAppData, resetKnowledgeBaseData } from "../thunks/syncAppData";

export type ChallengeProgressState = {
  completedIds: string[];
};

const initialState: ChallengeProgressState = {
  completedIds: [],
};

const challengeProgressSlice = createSlice({
  name: "challengeProgress",
  initialState,
  reducers: {
    setChallengeProgress(state, action: PayloadAction<string[]>) {
      state.completedIds = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(resetAppData, () => initialState)
      .addCase(resetKnowledgeBaseData, () => initialState);
  },
});

export const { setChallengeProgress } = challengeProgressSlice.actions;
export default challengeProgressSlice.reducer;
