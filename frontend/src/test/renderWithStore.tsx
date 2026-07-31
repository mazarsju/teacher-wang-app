import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { Provider } from "react-redux";
import {
  createAppStore,
  type AppStore,
  type RootState,
} from "../store";

type RenderWithStoreOptions = Omit<RenderOptions, "wrapper"> & {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
};

export function renderWithStore(
  ui: ReactElement,
  {
    preloadedState,
    store = createAppStore(preloadedState),
    ...renderOptions
  }: RenderWithStoreOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
