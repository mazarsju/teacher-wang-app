import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnkiSyncModal from "./AnkiSyncModal";
import * as ankiApi from "../utils/anki/ankiApi";
import { renderWithStore } from "../test/renderWithStore";
import type { AnkiPendingSync, AnkiSyncResult } from "../types/anki";

vi.mock("../utils/anki/ankiApi", () => ({
  fetchAnkiPendingSync: vi.fn(),
  runAnkiSync: vi.fn(),
}));

const fetchAnkiPendingSync = vi.mocked(ankiApi.fetchAnkiPendingSync);
const runAnkiSync = vi.mocked(ankiApi.runAnkiSync);

const vocabularyPending: AnkiPendingSync = {
  kind: "mandarin_vocabulary",
  count: 2,
  cards: [
    {
      id: "水",
      writing: "水",
      pinyin: "shui3",
      definition: "water",
    },
    {
      id: "火",
      writing: "火",
      pinyin: "huo3",
      definition: "fire",
    },
  ],
  unsyncable: [],
  pull_count: 3,
  pull_cards: [
    {
      id: "风",
      writing: "风",
      pinyin: "feng1",
      definition: "wind",
    },
  ],
  deck: {
    status: "not_synchronized",
    deck_name: "Vocab",
    model_name: "Vocab",
    fields: {
      writing: "writing",
      pinyin: "pinyin",
      definition: "definition",
    },
  },
};

const pushAllResult: AnkiSyncResult = {
  kind: "mandarin_vocabulary",
  action: "synchronize_all",
  direction: "push",
  added: 2,
  ignored: 0,
  failed: 0,
  deck: {
    status: "synchronized",
    deck_name: "Vocab",
    model_name: "Vocab",
    fields: {
      writing: "writing",
      pinyin: "pinyin",
      definition: "definition",
    },
  },
};

describe("AnkiSyncModal", () => {
  beforeEach(() => {
    fetchAnkiPendingSync.mockReset();
    runAnkiSync.mockReset();
  });

  it("loads push/pull sections and runs push all to Anki", async () => {
    const onSynced = vi.fn();
    fetchAnkiPendingSync.mockResolvedValue(vocabularyPending);
    runAnkiSync.mockResolvedValue(pushAllResult);

    const user = userEvent.setup();
    renderWithStore(
      <AnkiSyncModal
        isOpen
        kind="mandarin_vocabulary"
        onCancel={vi.fn()}
        onSynced={onSynced}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: /Sync — Mandarin vocabulary/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 cards to push")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Push all to Anki" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(runAnkiSync).toHaveBeenCalledWith({
        kind: "mandarin_vocabulary",
        action: "synchronize_all",
        direction: "push",
        hskCharacterPinyin: {},
      });
    });
    expect(onSynced).toHaveBeenCalledWith("push", pushAllResult);
  });

  it("runs pull all from Anki", async () => {
    const onSynced = vi.fn();
    fetchAnkiPendingSync.mockResolvedValue(vocabularyPending);
    const pullResult: AnkiSyncResult = {
      ...pushAllResult,
      action: "synchronize_all",
      direction: "pull",
      added: 1,
    };
    runAnkiSync.mockResolvedValue(pullResult);

    const user = userEvent.setup();
    renderWithStore(
      <AnkiSyncModal
        isOpen
        kind="mandarin_vocabulary"
        onCancel={vi.fn()}
        onSynced={onSynced}
      />,
    );

    await screen.findByText("3 cards to pull");
    await user.click(screen.getByRole("button", { name: "Pull all from Anki" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(runAnkiSync).toHaveBeenCalledWith({
        kind: "mandarin_vocabulary",
        action: "synchronize_all",
        direction: "pull",
        hskCharacterPinyin: {},
      });
    });
    expect(onSynced).toHaveBeenCalledWith("pull", pullResult);
  });

  it("runs partial push with selected cards", async () => {
    const onSynced = vi.fn();
    fetchAnkiPendingSync.mockResolvedValue(vocabularyPending);
    const partialPushResult: AnkiSyncResult = {
      ...pushAllResult,
      action: "partial",
      added: 1,
      ignored: 1,
    };
    runAnkiSync.mockResolvedValue(partialPushResult);

    const user = userEvent.setup();
    renderWithStore(
      <AnkiSyncModal
        isOpen
        kind="mandarin_vocabulary"
        onCancel={vi.fn()}
        onSynced={onSynced}
      />,
    );

    await screen.findByText("2 cards to push");
    await user.click(
      screen.getByRole("button", { name: "Choose what to push" }),
    );
    const fireCheckbox = screen.getByRole("checkbox", { name: "Select 火" });
    await user.click(fireCheckbox);
    await user.click(screen.getByRole("button", { name: "Confirm push" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(runAnkiSync).toHaveBeenCalledWith({
        kind: "mandarin_vocabulary",
        action: "partial",
        direction: "push",
        selectedIds: ["水"],
        hskCharacterPinyin: {},
      });
    });
    expect(onSynced).toHaveBeenCalledWith("push", partialPushResult);
  });

  it("shows writing unsyncable characters", async () => {
    fetchAnkiPendingSync.mockResolvedValue({
      kind: "mandarin_writing",
      count: 1,
      cards: [
        {
          id: "water (shui3)",
          recto: "water (shui3)",
          verso: "水",
        },
      ],
      unsyncable: ["孤"],
      pull_count: 0,
      pull_cards: [],
      deck: {
        status: "not_synchronized",
        deck_name: "Writing",
        model_name: "Basic",
        fields: { recto: "Front", verso: "Back" },
      },
    });

    renderWithStore(
      <AnkiSyncModal
        isOpen
        kind="mandarin_writing"
        onCancel={vi.fn()}
        onSynced={vi.fn()}
      />,
    );

    expect(await screen.findByText("孤")).toBeInTheDocument();
    expect(screen.getByText("1 card to push")).toBeInTheDocument();
  });

  it("shows an all-set state and hides the action buttons when nothing is pending", async () => {
    fetchAnkiPendingSync.mockResolvedValue({
      kind: "mandarin_vocabulary",
      count: 0,
      cards: [],
      unsyncable: [],
      pull_count: 0,
      pull_cards: [],
      deck: {
        status: "synchronized",
        deck_name: "Vocab",
        model_name: "Vocab",
        fields: {
          writing: "writing",
          pinyin: "pinyin",
          definition: "definition",
        },
      },
    });

    renderWithStore(
      <AnkiSyncModal
        isOpen
        kind="mandarin_vocabulary"
        onCancel={vi.fn()}
        onSynced={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("You’re all set, nothing to push."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You’re all set, nothing to pull."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Push all to Anki" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ignore all for push" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choose what to push" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pull all from Anki" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ignore all for pull" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choose what to pull" }),
    ).not.toBeInTheDocument();
  });
});
