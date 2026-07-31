import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "../test/renderWithStore";
import HomePage from "./HomePage";

const characters = [
  {
    char: "爱",
    pinyin: "ai4",
    writting_known: true,
    updated_at: "2026-07-12T12:00:00+00:00",
  },
  {
    char: "好",
    pinyin: "hao3",
    writting_known: false,
    updated_at: "2026-07-12T12:00:00+00:00",
  },
];

const hskLevelStatus = {
  current_level: null,
  next_level: 1,
  characters_to_next_level: 1,
  progress_to_next_level: (2 / 3) * 100,
  missing_characters: ["八"],
  max_level: 7,
  completion_ratio: 0.85,
};

const syncedState = {
  characters: { items: characters },
  hsk: { status: hskLevelStatus },
  sync: {
    status: "succeeded" as const,
    error: null,
    lastSyncedAt: "2026-07-31T00:00:00.000Z",
  },
};

describe("HomePage", () => {
  it("renders character metrics and HSK level from the store", () => {
    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("Your HSK journey starts here")).toBeInTheDocument();
    expect(screen.getByText("1 character to reach HSK 1")).toBeInTheDocument();
    expect(screen.getByLabelText("HSK level")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How HSK level is estimated" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Characters you are able to recognize")).toBeInTheDocument();
    expect(screen.getByText("Characters you can write")).toBeInTheDocument();
  });

  it("explains how the HSK level is estimated", async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, { preloadedState: syncedState });

    await user.click(
      screen.getByRole("button", { name: "How HSK level is estimated" }),
    );

    expect(
      screen.getByRole("heading", { name: "How HSK level is estimated" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /know at least 85% of all characters expected up to that level/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/missing-characters list includes gaps from earlier levels/i),
    ).toBeInTheDocument();
  });

  it("opens the missing characters list from the banner", async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, { preloadedState: syncedState });

    await user.click(screen.getByRole("button", { name: "Missing characters" }));

    expect(
      screen.getByRole("heading", { name: "Missing characters for HSK 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("八")).toBeInTheDocument();
  });

  it("shows an error when progress fails to load", async () => {
    renderWithStore(<HomePage />, {
      preloadedState: {
        sync: {
          status: "failed",
          error: "Failed to load characters.",
          lastSyncedAt: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });
  });
});
