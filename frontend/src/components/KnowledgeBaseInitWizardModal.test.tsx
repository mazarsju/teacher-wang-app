import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeBaseInitWizardModal from "./KnowledgeBaseInitWizardModal";
import { renderWithStore } from "../test/renderWithStore";

function matchesApiPath(url: string, path: string) {
  const expected = path.startsWith("/api/") ? path : `/api${path}`;
  return new URL(url, "http://localhost").pathname === expected;
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
    const hskWordPool = [
      { word: "爱", pinyin: "ai4", definition: "to love" },
      { word: "好", pinyin: "hao3", definition: "good" },
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");

      if (url.pathname === "/api/hsk-words/next") {
        const excluded = new Set(
          (url.searchParams.get("exclude") ?? "").split(",").filter(Boolean),
        );
        const next = hskWordPool.find((entry) => !excluded.has(entry.word));
        return Promise.resolve({
          ok: true,
          json: async () => ({
            word: next
              ? {
                  id: `${next.word}|${next.pinyin}`,
                  level: 1,
                  frequency: 1,
                  characters: [...next.word],
                  ...next,
                }
              : null,
          }),
        });
      }
      if (url.pathname === "/api/characters/bulk" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: "File received" }),
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
    await user.click(screen.getByRole("button", { name: "Don't know it" }));

    await waitFor(() => {
      expect(
        screen.getByText("No more words available right now."),
      ).toBeInTheDocument();
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

    const bulkImportCall = fetchMock.mock.calls.find(([requestInput]) =>
      String(requestInput).endsWith("/characters/bulk"),
    );
    expect(bulkImportCall).toBeDefined();
    const uploadedFile = (bulkImportCall?.[1]?.body as FormData).get("file") as File;
    expect(await uploadedFile.text()).toBe("爱;ai;4;false;爱");
  });

  it("removes a picked word from the review list", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");

      if (url.pathname === "/api/hsk-words/next") {
        const excluded = url.searchParams.get("exclude") ?? "";
        const word = excluded.includes("爱") ? null : "爱";
        return Promise.resolve({
          ok: true,
          json: async () => ({
            word: word
              ? {
                  id: "爱|ai4",
                  word: "爱",
                  level: 1,
                  frequency: 1,
                  pinyin: "ai4",
                  definition: "to love",
                  characters: ["爱"],
                }
              : null,
          }),
        });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
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

  it("keeps showing the previous word, disabled, while the next one loads", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    let resolveSecondPick: (() => void) | null = null;

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");

      if (url.pathname === "/api/hsk-words/next") {
        const excluded = url.searchParams.get("exclude") ?? "";
        if (!excluded) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              word: {
                id: "爱|ai4",
                word: "爱",
                level: 1,
                frequency: 1,
                pinyin: "ai4",
                definition: "to love",
                characters: ["爱"],
              },
            }),
          });
        }

        return new Promise((resolve) => {
          resolveSecondPick = () =>
            resolve({
              ok: true,
              json: async () => ({
                word: {
                  id: "好|hao3",
                  word: "好",
                  level: 1,
                  frequency: 2,
                  pinyin: "hao3",
                  definition: "good",
                  characters: ["好"],
                },
              }),
            });
        });
      }

      return Promise.resolve({ ok: false, json: async () => ({}) });
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
    // Part 2 card — not disappear into a "No more words" / blank flash —
    // and the pick buttons must be disabled rather than removed, so Part 2
    // doesn't jump. (It now also appears in the Part 3 table below, hence
    // scoping the lookup to the card.)
    expect(
      document.querySelector(".wizard-word-picker-hanzi"),
    ).toHaveTextContent("爱");
    expect(
      screen.queryByText("No more words available right now."),
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
