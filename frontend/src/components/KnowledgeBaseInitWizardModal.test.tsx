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

  it("imports a CSV file via the same import action as the Knowledge base screen", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    renderWithStore(
      <KnowledgeBaseInitWizardModal isOpen onClose={() => {}} />,
    );

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
      expect(
        screen.getByText("Your knowledge base has been imported successfully."),
      ).toBeInTheDocument();
    });
  });
});
