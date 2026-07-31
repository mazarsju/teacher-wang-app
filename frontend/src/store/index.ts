import { combineReducers, configureStore } from "@reduxjs/toolkit";
import ankiReducer from "./slices/ankiSlice";
import charactersReducer from "./slices/charactersSlice";
import hskReducer from "./slices/hskSlice";
import settingsReducer from "./slices/settingsSlice";
import syncReducer from "./slices/syncSlice";
import wordsReducer from "./slices/wordsSlice";

const rootReducer = combineReducers({
  characters: charactersReducer,
  words: wordsReducer,
  settings: settingsReducer,
  hsk: hskReducer,
  anki: ankiReducer,
  sync: syncReducer,
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
