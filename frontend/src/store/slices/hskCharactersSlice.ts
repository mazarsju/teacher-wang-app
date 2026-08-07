import { createSlice } from "@reduxjs/toolkit";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type HskCharactersState = {
  pinyinByCharacter: Record<string, string>;
};

const initialState: HskCharactersState = {
  pinyinByCharacter: {},
};

const hskCharactersSlice = createSlice({
  name: "hskCharacters",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.fulfilled, (state, action) => {
        state.pinyinByCharacter = action.payload.hskCharacterPinyin;
      })
      .addCase(resetAppData, () => initialState);
  },
});

export default hskCharactersSlice.reducer;
