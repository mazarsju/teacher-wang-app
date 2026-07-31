import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Word } from "../../types/word";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type WordsState = {
  items: Word[];
};

const initialState: WordsState = {
  items: [],
};

function sortWords(words: Word[]) {
  return [...words].sort((left, right) => left.word.localeCompare(right.word));
}

const wordsSlice = createSlice({
  name: "words",
  initialState,
  reducers: {
    setWords(state, action: PayloadAction<Word[]>) {
      state.items = sortWords(action.payload);
    },
    upsertWord(state, action: PayloadAction<Word>) {
      const index = state.items.findIndex(
        (item) => item.word === action.payload.word,
      );
      if (index === -1) {
        state.items = sortWords([...state.items, action.payload]);
        return;
      }
      state.items[index] = action.payload;
    },
    removeWord(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.word !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.fulfilled, (state, action) => {
        state.items = sortWords(action.payload.words);
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const { setWords, upsertWord, removeWord } = wordsSlice.actions;
export default wordsSlice.reducer;
