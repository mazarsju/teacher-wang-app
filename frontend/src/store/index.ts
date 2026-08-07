import { combineReducers, configureStore } from "@reduxjs/toolkit";
import ankiReducer from "./slices/ankiSlice";
import challengeProgressReducer from "./slices/challengeProgressSlice";
import charactersReducer from "./slices/charactersSlice";
import hskReducer from "./slices/hskSlice";
import hskCharactersReducer from "./slices/hskCharactersSlice";
import syncReducer from "./slices/syncSlice";
import wordsReducer from "./slices/wordsSlice";

const rootReducer = combineReducers({
  characters: charactersReducer,
  words: wordsReducer,
  hsk: hskReducer,
  hskCharacters: hskCharactersReducer,
  anki: ankiReducer,
  sync: syncReducer,
  challengeProgress: challengeProgressReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export function createAppStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
  });
}

export const store = createAppStore();

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore["dispatch"];
