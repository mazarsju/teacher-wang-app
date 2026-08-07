import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBaseInitWizardModal from "./KnowledgeBaseInitWizardModal";
import { renderWithStore } from "../test/renderWithStore";

function matchesApiPath(url: string, path: string) {
  const expected = path.startsWith("/api/") ? path : `/api${path}`;
  return new URL(url, "http://localhost").pathname === expected;
}

function jsonBody(init?: RequestInit) {
  return init?.body ? JSON.parse(String(init.body)) : {};
}

function hskWord(word: string, pinyin: string, definition: string, frequency = 1) {
  return { id: `${word}|${pinyin}`, word, pinyin, definition, level: 1, frequency };
}

type PickState = { current_index: number; previous_index: number; increment: number };

function nextWordResponse(
  word: ReturnType<typeof hskWord> | null,
  state: PickState,
  wordsBetween: ReturnType<typeof hskWord>[] = [],
) {
  return Promise.resolve({
    ok: true,
    json: async () => ({
      word,
      current_index: state.current_index,
      previous_index: state.previous_index,
      increment: state.increment,
      words_between: wordsBetween,
    }),
  });
}

function defaultFetchResponse(url: URL, init?: RequestInit) {
  if (url.pathname.endsWith("/characters/bulk") && init?.method === "POST") {
    return Promise.resolve({
      ok: true,
      json: async () => ({ message: "File received" }),
    });
  }
  if (url.pathname.endsWith("/characters/bulk-create") && init?.method === "POST") {
    const characters = jsonBody(init).characters as {
      char: string;
      pinyin: string;
      writting_known: boolean;
    }[];
    return Promise.resolve({
      ok: true,
      json: async () => ({
        characters: characters.map((entry) => ({
          ...entry,
          updated_at: "2026-01-01T00:00:00+00:00",
        })),
      }),
    });
  }
  if (url.pathname.endsWith("/words/bulk-create") && init?.method === "POST") {
    const words = jsonBody(init).words as { word: string; definition: string | null }[];
    return Promise.resolve({
      ok: true,
      json: async () => ({
        words: words.map((entry) => ({
          ...entry,
          updated_at: "2026-01-01T00:00:00+00:00",
          characters: [...entry.word],
        })),
      }),
    });
  }
  if (url.pathname.startsWith("/api/words/") && init?.method === "PATCH") {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        word: decodeURIComponent(url.pathname.replace("/api/words/", "")),
        definition: jsonBody(init).definition,
        updated_at: "2026-01-01T00:00:00+00:00",
      }),
    });
  }
  if (matchesApiPath(url.pathname, "/characters")) {
    return Promise.resolve({ ok: true, json: async () => [] });
  }
  if (matchesApiPath(url.pathname, "/words")) {
    return Promise.resolve({ ok: true, json: async () => [] });
  }
  if (matchesApiPath(url.pathname, "/hsk-level")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        current_level: null,
        next_level: 1,
        characters_to_next_level: 1,
        progress_to_next_level: 0,
        missing_characters: [],
        max_level: 7,
        completion_ratio: 0,
      }),
    });
  }

  return Promise.resolve({ ok: false, json: async () => ({}) });
}

describe("KnowledgeBaseInitWizardModal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);

        if (matchesApiPath(url, "/characters")) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (matchesApiPath(url, "/words")) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (matchesApiPath(url, "/hsk-level")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              current_level: null,
              next_level: 1,
              characters_to_next_level: 1,
              progress_to_next_level: 0,
              missing_characters: [],
              max_level: 7,
              completion_ratio: 0,
            }),
          });
        }
        if (matchesApiPath(url, "/anki/status")) {
          return Promise.resolve({ ok: false, json: async () => ({}) });
        }

        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    const { container } = renderWithStore(
      <KnowledgeBaseInitWizardModal isOpen={false} onClose={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the four options and calls onClose from the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithStore(
      <KnowledgeBaseInitWizardModal isOpen onClose={onClose} />,
    );

    expect(
      screen.getByRole("heading", { name: "Build your knowledge base" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Add characters and words one by one, manually",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload an existing knowledge base (CSV)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import data from an Anki deck" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking the overlay", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithStore(
      <KnowledgeBaseInitWizardModal isOpen onClose={onClose} />,
    );

    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a heads-up step before sending the manual option to the Knowledge base screen", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    renderWithStore(
      <KnowledgeBaseInitWizardModal
        isOpen
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add characters and words one by one, manually",
      }),
    );

    expect(
      screen.getByText(
        "You should go to the Knowledge base section for that and manually create what you want.",
      ),
    ).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Go to Knowledge base" }),
    );

    expect(onNavigate).toHaveBeenCalledWith("knowledge-base");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a heads-up step before sending the Anki option to the Preferences screen", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    renderWithStore(
      <KnowledgeBaseInitWizardModal
        isOpen
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Import data from an Anki deck" }),
    );

    expect(
      screen.getByText(
        "You can setup your Anki synchronization in the Preference section.",
      ),
    ).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Go to Preferences" }));

    expect(onNavigate).toHaveBeenCalledWith("preferences");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("imports a CSV file via the same import action as the Knowledge base screen, then closes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const onClose = vi.fn();

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={onClose} />);

    await user.click(
      screen.getByRole("button", { name: "Upload an existing knowledge base (CSV)" }),
    );

    expect(
      screen.getByText(/Upload a text file with one character per line/),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "爱" })).toBeInTheDocument();
    expect(
      screen.getByRole("cell", {
        name: "可爱, 我爱学习, 我爱生气, 爱, 爱好, 爱情, 相爱",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/column names shown above are just for illustration/),
    ).toBeInTheDocument();

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/characters/bulk") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: "File received" }),
        });
      }
      if (matchesApiPath(url, "/characters")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (matchesApiPath(url, "/words")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (matchesApiPath(url, "/hsk-level")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            current_level: null,
            next_level: 1,
            characters_to_next_level: 1,
            progress_to_next_level: 0,
            missing_characters: [],
            max_level: 7,
            completion_ratio: 0,
          }),
        });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    const fileInput = document.querySelector(
      ".knowledge-base-import-input",
    ) as HTMLInputElement;
    const file = new File(["好;hao;3;true;"], "db.csv", { type: "text/csv" });

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("lets the user pick, skip, adjust, and confirm smart-creation words", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const ai = hskWord("爱", "ai4", "to love", 0);
    const hao = hskWord("好", "hao3", "good", 2);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(ai, { current_index: 0, previous_index: -1, increment: 1 });
      }
      if (body.decision === "can_write") {
        return nextWordResponse(hao, { current_index: 2, previous_index: 0, increment: 2 });
      }
      if (body.decision === "dont_know") {
        return nextWordResponse(null, { current_index: 1, previous_index: 0, increment: 1 });
      }
      throw new Error(`Unexpected decision: ${body.decision}`);
    });

    const onClose = vi.fn();
    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={onClose} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("爱")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Can write it" }));

    expect(await screen.findByText("好")).toBeInTheDocument();
    expect(jsonBody(fetchMock.mock.calls.at(-1)?.[1])).toEqual({
      decision: "can_write",
      current_index: 0,
      previous_index: -1,
      increment: 1,
      exclude: [],
    });

    await user.click(screen.getByRole("button", { name: "Don't know it" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Your quick setup is done! Please review the list below.",
        ),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Don't know it" }),
    ).not.toBeInTheDocument();
    expect(jsonBody(fetchMock.mock.calls.at(-1)?.[1])).toEqual({
      decision: "dont_know",
      current_index: 2,
      previous_index: 0,
      increment: 2,
      exclude: ["爱"],
    });

    expect(screen.getByRole("cell", { name: "爱" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "好" })).not.toBeInTheDocument();

    const knownToWriteToggle = screen.getByRole("switch");
    expect(knownToWriteToggle).toBeChecked();
    await user.click(knownToWriteToggle);
    expect(knownToWriteToggle).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });

    const bulkCharacterCall = fetchMock.mock.calls.find(([requestInput]) =>
      String(requestInput).endsWith("/characters/bulk-create"),
    );
    expect(bulkCharacterCall).toBeDefined();
    expect(jsonBody(bulkCharacterCall?.[1])).toEqual({
      characters: [{ char: "爱", pinyin: "ai4", writting_known: false }],
    });

    const bulkWordCall = fetchMock.mock.calls.find(([requestInput]) =>
      String(requestInput).endsWith("/words/bulk-create"),
    );
    expect(bulkWordCall).toBeDefined();
    expect(jsonBody(bulkWordCall?.[1])).toEqual({
      words: [{ word: "爱", definition: "to love", pinyin: "ai4" }],
    });
  });

  it("shows sync progress while confirming smart-creation words", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const ai = hskWord("爱", "ai4", "to love", 0);

    let releaseCharacterBulkCreate: (() => void) | undefined;
    const characterBulkCreateGate = new Promise<void>((resolve) => {
      releaseCharacterBulkCreate = resolve;
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/characters/bulk-create") && init?.method === "POST") {
        await characterBulkCreateGate;
      }
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(ai, { current_index: 0, previous_index: -1, increment: 1 });
      }
      return nextWordResponse(null, { current_index: 1, previous_index: 0, increment: 1 });
    });

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("爱")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Can recognize it" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Your quick setup is done! Please review the list below.",
        ),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    const progressBar = await screen.findByRole("progressbar");
    expect(progressBar).toHaveAttribute("max", "2");
    expect(screen.getByText(/Syncing your knowledge base… 0\/2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    releaseCharacterBulkCreate?.();

    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
  });

  it("adds words a jump skipped over as already known, tagged by the decision", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const first = hskWord("一", "yi1", "one", 0);
    const skipped = hskWord("二", "er4", "two", 1);
    const second = hskWord("三", "san1", "three", 2);
    const skippedAfterRecognize = hskWord("四", "si4", "four", 3);
    const third = hskWord("五", "wu3", "five", 4);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(first, { current_index: 0, previous_index: -1, increment: 1 });
      }
      if (body.decision === "can_write") {
        return nextWordResponse(
          second,
          { current_index: 2, previous_index: 0, increment: 2 },
          [skipped],
        );
      }
      if (body.decision === "can_recognize") {
        return nextWordResponse(
          third,
          { current_index: 4, previous_index: 2, increment: 2 },
          [skippedAfterRecognize],
        );
      }
      throw new Error(`Unexpected decision: ${body.decision}`);
    });

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("一")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Can write it" }));

    // "一" (decided) and "二" (skipped over by the jump) both land in the
    // review list, marked as known-to-write since the decision was "Can
    // write it". "三" becomes the next candidate shown in Part 2.
    expect(await screen.findByText("三")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("一");
    expect(rows[1]).toHaveTextContent("二");
    for (const row of rows) {
      expect(row.querySelector("input[type=checkbox]")).toBeChecked();
    }

    await user.click(screen.getByRole("button", { name: "Can recognize it" }));

    // "三" (decided) and "四" (skipped) are added next, this time marked as
    // not known-to-write since the decision was "Can recognize it". "五"
    // becomes the next candidate shown in Part 2.
    expect(await screen.findByText("五")).toBeInTheDocument();
    const allRows = screen.getAllByRole("row").slice(1);
    expect(allRows).toHaveLength(4);
    expect(allRows[2]).toHaveTextContent("三");
    expect(allRows[3]).toHaveTextContent("四");
    expect(allRows[2].querySelector("input[type=checkbox]")).not.toBeChecked();
    expect(allRows[3].querySelector("input[type=checkbox]")).not.toBeChecked();

    // The "Can recognize it" request (sent right before this round's
    // response) already excludes everything shown or auto-added in round 1.
    expect(jsonBody(fetchMock.mock.calls.at(-1)?.[1]).exclude).toEqual([
      "一",
      "二",
    ]);
  });

  it("removes a picked word from the review list", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const ai = hskWord("爱", "ai4", "to love");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(ai, { current_index: 0, previous_index: -1, increment: 1 });
      }
      return nextWordResponse(null, { current_index: 2, previous_index: 0, increment: 2 });
    });

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("爱")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Can recognize it" }));

    expect(await screen.findByRole("cell", { name: "爱" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByText("No words picked yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm" }),
    ).toBeDisabled();
  });

  it("always shows the full review table, with no expand/collapse control", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const ai = hskWord("爱", "ai4", "to love");

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(ai, { current_index: 0, previous_index: -1, increment: 1 });
      }
      return nextWordResponse(null, { current_index: 2, previous_index: 0, increment: 2 });
    });

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("爱")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Can recognize it" }));
    await screen.findByRole("cell", { name: "爱" });

    expect(document.querySelector(".table-wrapper")).not.toHaveClass(
      "table-wrapper--scrollable",
    );
    expect(
      screen.queryByRole("button", { name: "Expand" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Collapse" }),
    ).not.toBeInTheDocument();
  });

  it("treats a repeated word as the end of the quick setup", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const ai = hskWord("爱", "ai4", "to love", 0);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(ai, { current_index: 5, previous_index: 4, increment: 2 });
      }
      // The walk converged: it proposes the exact same word again instead
      // of moving on.
      return nextWordResponse(ai, { current_index: 5, previous_index: 4, increment: 1 });
    });

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("爱")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Don't know it" }));

    expect(
      await screen.findByText(
        "Your quick setup is done! Please review the list below.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector(".wizard-word-picker-hanzi")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Don't know it" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Can recognize it" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Can write it" }),
    ).not.toBeInTheDocument();
    // "Don't know it" never adds a row, so the review list stays empty.
    expect(screen.getByText("No words picked yet.")).toBeInTheDocument();
  });

  it("disables 'Can write it' for the rest of the session after the first 'Can recognize it'", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const first = hskWord("爱", "ai4", "to love", 0);
    const second = hskWord("好", "hao3", "good", 1);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(first, { current_index: 0, previous_index: -1, increment: 1 });
      }
      return nextWordResponse(second, { current_index: 2, previous_index: 0, increment: 2 });
    });

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("爱")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can write it" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Can recognize it" }));

    // Once a candidate word arrives after the "Can recognize it" click,
    // "Can write it" stays disabled — not just because a fetch is in
    // flight or there's no candidate — for the rest of the session.
    expect(await screen.findByText("好")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can write it" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Don't know it" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Can recognize it" }),
    ).toBeEnabled();
  });

  it("keeps showing the previous word, disabled, while the next one loads", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const ai = hskWord("爱", "ai4", "to love");
    const hao = hskWord("好", "hao3", "good", 2);
    let resolveSecondPick: (() => void) | null = null;

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname !== "/api/hsk-words/next") {
        return defaultFetchResponse(url, init);
      }

      const body = jsonBody(init);
      if (body.decision == null) {
        return nextWordResponse(ai, { current_index: 0, previous_index: -1, increment: 1 });
      }

      return new Promise((resolve) => {
        resolveSecondPick = () =>
          resolve({
            ok: true,
            json: async () => ({
              word: hao,
              current_index: 2,
              previous_index: 0,
              increment: 2,
              words_between: [],
            }),
          });
      });
    });

    renderWithStore(<KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />);

    await user.click(
      screen.getByRole("button", {
        name: "Smart creation based on what you already know",
      }),
    );

    expect(await screen.findByText("爱")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Can write it" }));

    // While the next word is still loading, "爱" must stay on screen in the
    // Part 2 card — not disappear into a "quick setup is done" / blank
    // flash — and the pick buttons must be disabled rather than removed,
    // so Part 2 doesn't jump. (It now also appears in the Part 3 table
    // below, hence scoping the lookup to the card.)
    expect(
      document.querySelector(".wizard-word-picker-hanzi"),
    ).toHaveTextContent("爱");
    expect(
      screen.queryByText(
        "Your quick setup is done! Please review the list below.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Don't know it" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Can recognize it" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Can write it" })).toBeDisabled();

    resolveSecondPick?.();

    expect(await screen.findByText("好")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can write it" })).toBeEnabled();
  });
});
