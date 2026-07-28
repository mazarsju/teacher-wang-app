import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnkiSyncModal from "./AnkiSyncModal";

describe("AnkiSyncModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads pending vocabulary cards and runs synchronize all", async () => {
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
      await screen.findByText("2 elements need to be synchronized."),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Synchronize all" }),
    );

    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
    expect(
      within(confirmDialog).getByText(
        /It will add all 2 cards to the Anki deck/,
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
    expect(syncCall).toBeDefined();
    expect(JSON.parse(String((syncCall?.[1] as RequestInit).body))).toEqual({
      kind: "mandarin_vocabulary",
      action: "synchronize_all",
      selected_ids: undefined,
    });
  });

  it("supports partial selection with select/unselect all", async () => {
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

    await screen.findByText("2 elements need to be synchronized.");
    await userEvent.click(
      screen.getByRole("button", { name: "Partial synchronization" }),
    );

    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unselect all" }));
    expect(screen.getByText("0 of 2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Select 水"));
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const confirmDialog = screen.getByRole("dialog", {
      name: /cannot be undone/i,
    });
    expect(
      within(confirmDialog).getByText(
        /1 card currently selected will be synchronized/,
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Confirm" }),
    );

    await waitFor(() => {
      expect(onSynced).toHaveBeenCalledTimes(1);
    });
  });
});
