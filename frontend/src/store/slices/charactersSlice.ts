import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Character } from "../../types/character";
import { resetAppData, syncAppData } from "../thunks/syncAppData";

export type CharactersState = {
  items: Character[];
};

const initialState: CharactersState = {
  items: [],
};

function sortCharacters(characters: Character[]) {
  return [...characters].sort((left, right) =>
    left.char.localeCompare(right.char, "zh"),
  );
}

const charactersSlice = createSlice({
  name: "characters",
  initialState,
  reducers: {
    setCharacters(state, action: PayloadAction<Character[]>) {
      state.items = sortCharacters(action.payload);
    },
    upsertCharacter(state, action: PayloadAction<Character>) {
      const index = state.items.findIndex(
        (item) => item.char === action.payload.char,
      );
      if (index === -1) {
        state.items = sortCharacters([...state.items, action.payload]);
        return;
      }
      state.items[index] = action.payload;
    },
    removeCharacter(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.char !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncAppData.fulfilled, (state, action) => {
        state.items = sortCharacters(action.payload.characters);
      })
      .addCase(resetAppData, () => initialState);
  },
});

export const { setCharacters, upsertCharacter, removeCharacter } =
  charactersSlice.actions;
export default charactersSlice.reducer;
