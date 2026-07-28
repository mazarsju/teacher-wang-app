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
            pull_cards: [
              {
                id: "风",
                writting: "风",
                pinyin: "feng1",
                definition: "wind",
              },
            ],
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
            direction: "push",
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
    expect(screen.getByText("2 cards to push")).toBeInTheDocument();
    expect(screen.getByText("3 cards to pull")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Push all to Anki" }),
    );

    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
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
    expect(JSON.parse(String((syncCall?.[1] as RequestInit).body))).toEqual({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "push",
      selected_ids: undefined,
    });
  });

  it("pulls all vocabulary cards from Anki", async () => {
    const onSynced = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/anki/sync/pending/mandarin_vocabulary") && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: "mandarin_vocabulary",
            count: 0,
            cards: [],
            unsyncable: [],
            pull_count: 2,
            pull_cards: [
              {
                id: "火",
                writting: "火",
                pinyin: "huo3",
                definition: "fire",
                characters_to_create: ["火"],
              },
              {
                id: "风",
                writting: "风",
                pinyin: "feng1",
                definition: "wind",
                characters_to_create: ["风"],
              },
            ],
            pull_characters_to_create_count: 2,
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

      if (url.endsWith("/anki/sync") && method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: "mandarin_vocabulary",
            action: "synchronize_all",
            direction: "pull",
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

    expect(await screen.findByText("2 cards to pull")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Pull all from Anki" }),
    );
    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
    expect(
      within(confirmDialog).getByText(
        /pull all 2 cards from Anki into your knowledge base, adding 2 characters to the character table/,
      ),
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
    expect(JSON.parse(String((syncCall?.[1] as RequestInit).body))).toEqual({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      direction: "pull",
      selected_ids: undefined,
    });
  });

  it("supports choose what to pull", async () => {
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
              count: 0,
              cards: [],
              unsyncable: [],
              pull_count: 2,
              pull_cards: [
                {
                  id: "火",
                  writting: "火",
                  pinyin: "huo3",
                  definition: "fire",
                },
                {
                  id: "风",
                  writting: "风",
                  pinyin: "feng1",
                  definition: "wind",
                },
              ],
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

        if (url.endsWith("/anki/sync") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              kind: "mandarin_vocabulary",
              action: "partial",
              direction: "pull",
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

    await screen.findByText("2 cards to pull");
    await userEvent.click(
      screen.getByRole("button", { name: "Choose what to pull" }),
    );
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unselect all" }));
    await userEvent.click(screen.getByLabelText("Select 火"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm pull" }));

    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
    expect(
      within(confirmDialog).getByText(/1 card currently selected will be pulled/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Confirm" }),
    );

    await waitFor(() => {
      expect(onSynced).toHaveBeenCalledTimes(1);
    });
  });

  it("pulls writing characters and shows missing warning", async () => {
    const onSynced = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
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
            count: 0,
            cards: [],
            unsyncable: [],
            pull_count: 2,
            pull_cards: [
              {
                id: "水",
                recto: "shui3",
                verso: "水",
              },
            ],
            pull_missing: ["孤"],
            deck: {
              status: "not_synchronized",
              deck_name: "Writting",
              model_name: "Basic",
              fields: { recto: "Front", verso: "Back" },
            },
          }),
        });
      }

      if (url.endsWith("/anki/sync") && method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kind: "mandarin_writting",
            action: "synchronize_all",
            direction: "pull",
            added: 1,
            ignored: 0,
            failed: 0,
            deck: {
              status: "synchronized",
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
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AnkiSyncModal
        isOpen
        kind="mandarin_writting"
        onCancel={vi.fn()}
        onSynced={onSynced}
      />,
    );

    expect(await screen.findByText("2 characters to pull")).toBeInTheDocument();
    expect(
      screen.getByText(/Characters not yet in the knowledge base/),
    ).toBeInTheDocument();
    expect(screen.getByText(/孤/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Pull all from Anki" }),
    );
    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
    expect(
      within(confirmDialog).getByText(
        /pull all 1 character from Anki and mark them as “written known”/,
      ),
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
    expect(JSON.parse(String((syncCall?.[1] as RequestInit).body))).toEqual({
      kind: "mandarin_writting",
      action: "synchronize_all",
      direction: "pull",
      selected_ids: undefined,
    });
  });
});
