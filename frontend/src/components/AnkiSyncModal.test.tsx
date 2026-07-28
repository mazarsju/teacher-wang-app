import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnkiSyncModal from "./AnkiSyncModal";

describe("AnkiSyncModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads push/pull sections and runs push all to Anki", async () => {
    const onSynced = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/anki/sync/pending/mandarin_vocabulary") && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: "mandarin_vocabulary",
            count: 2,
            cards: [
              {
                id: "水",
                writting: "水",
                pinyin: "shui3",
                definition: "water",
              },
              {
                id: "火",
                writting: "火",
                pinyin: "huo3",
                definition: "fire",
              },
            ],
            unsyncable: [],
            pull_count: 3,
            deck: {
              status: "not_synchronized",
              deck_name: "Vocab",
              model_name: "Vocab",
              fields: {
                writting: "writting",
                pinyin: "pinyin",
                definition: "definition",
              },
            },
          }),
        });
      }

      if (url.endsWith("/anki/sync") && method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: "mandarin_vocabulary",
            action: "synchronize_all",
            added: 2,
            ignored: 0,
            failed: 0,
            deck: {
              status: "synchronized",
              deck_name: "Vocab",
              model_name: "Vocab",
              fields: {
                writting: "writting",
                pinyin: "pinyin",
                definition: "definition",
              },
            },
          }),
        });
      }

      return Promise.resolve({
        ok: false,
        json: async () => ({}),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AnkiSyncModal
        isOpen
        kind="mandarin_vocabulary"
        onCancel={vi.fn()}
        onSynced={onSynced}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Sync — Mandarin vocabulary" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Push to Anki" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pull from Anki" })).toBeInTheDocument();
    expect(screen.getByText("2 cards to push")).toBeInTheDocument();
    expect(screen.getByText("3 cards to pull")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Push all to Anki" }),
    );

    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
    expect(
      within(confirmDialog).getByText(/It will push all 2 cards to the Anki deck/),
    ).toBeInTheDocument();

    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Confirm" }),
    );

    await waitFor(() => {
      expect(onSynced).toHaveBeenCalledTimes(1);
    });

    const syncCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/anki/sync") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(syncCall).toBeDefined();
    expect(JSON.parse(String((syncCall?.[1] as RequestInit).body))).toEqual({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      selected_ids: undefined,
    });
  });

  it("supports choose what to push with select/unselect all", async () => {
    const onSynced = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (
          url.endsWith("/anki/sync/pending/mandarin_vocabulary") &&
          method === "GET"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              kind: "mandarin_vocabulary",
              count: 2,
              cards: [
                {
                  id: "水",
                  writting: "水",
                  pinyin: "shui3",
                  definition: "water",
                },
                {
                  id: "火",
                  writting: "火",
                  pinyin: "huo3",
                  definition: "fire",
                },
              ],
              unsyncable: [],
              pull_count: 0,
              deck: {
                status: "not_synchronized",
                deck_name: "Vocab",
                model_name: "Vocab",
                fields: {
                  writting: "writting",
                  pinyin: "pinyin",
                  definition: "definition",
                },
              },
            }),
          });
        }

        if (url.endsWith("/anki/sync") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              kind: "mandarin_vocabulary",
              action: "partial",
              added: 1,
              ignored: 1,
              failed: 0,
              deck: {
                status: "synchronized",
                deck_name: "Vocab",
                model_name: "Vocab",
                fields: {
                  writting: "writting",
                  pinyin: "pinyin",
                  definition: "definition",
                },
              },
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(
      <AnkiSyncModal
        isOpen
        kind="mandarin_vocabulary"
        onCancel={vi.fn()}
        onSynced={onSynced}
      />,
    );

    await screen.findByText("2 cards to push");
    await userEvent.click(
      screen.getByRole("button", { name: "Choose what to push" }),
    );

    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unselect all" }));
    expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Select 水"));
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm push" }));
    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
    expect(
      within(confirmDialog).getByText(
        /1 card currently selected will be pushed/,
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Confirm" }),
    );

    await waitFor(() => {
      expect(onSynced).toHaveBeenCalledTimes(1);
    });
  });

  it("shows pull coming-soon message when pull actions are used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (
          url.endsWith("/anki/sync/pending/mandarin_vocabulary") &&
          method === "GET"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              kind: "mandarin_vocabulary",
              count: 0,
              cards: [],
              unsyncable: [],
              pull_count: 4,
              deck: {
                status: "synchronized",
                deck_name: "Vocab",
                model_name: "Vocab",
                fields: {
                  writting: "writting",
                  pinyin: "pinyin",
                  definition: "definition",
                },
              },
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(
      <AnkiSyncModal
        isOpen
        kind="mandarin_vocabulary"
        onCancel={vi.fn()}
        onSynced={vi.fn()}
      />,
    );

    expect(await screen.findByText("4 cards to pull")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Push all to Anki" }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Pull all from Anki" }),
    );
    expect(
      screen.getByText(/Pull from Anki is not available yet/),
    ).toBeInTheDocument();
  });

  it("shows unsyncable writing characters under push", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (
          url.endsWith("/anki/sync/pending/mandarin_writting") &&
          method === "GET"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              kind: "mandarin_writting",
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
              deck: {
                status: "not_synchronized",
                deck_name: "Writting",
                model_name: "Basic",
                fields: { recto: "Front", verso: "Back" },
              },
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(
      <AnkiSyncModal
        isOpen
        kind="mandarin_writting"
        onCancel={vi.fn()}
        onSynced={vi.fn()}
      />,
    );

    expect(await screen.findByText("1 card to push")).toBeInTheDocument();
    expect(
      screen.getByText(/Characters that cannot be pushed/),
    ).toBeInTheDocument();
    expect(screen.getByText("孤")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ignore all for push" }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Choose what to push" }),
    );
    expect(screen.getByText("Recto")).toBeInTheDocument();
    expect(screen.getByText("water (shui3)")).toBeInTheDocument();
    expect(screen.queryByText("孤")).not.toBeInTheDocument();
  });
});
