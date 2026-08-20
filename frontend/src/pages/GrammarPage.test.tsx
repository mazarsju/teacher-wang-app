import { screen, waitFor } from "@testing-library/react";
import { renderWithStore } from "../test/renderWithStore";
import GrammarPage from "./GrammarPage";

function stubGrammarPointsFetch(
  points: {
    id: string;
    hsk_level: number;
    title: string;
    prerequisites: string[];
    status: string;
  }[],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => points,
    }),
  );
}

describe("GrammarPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders each grammar point as a card with its HSK level, title, and status", async () => {
    stubGrammarPointsFetch([
      {
        id: "1|Basic Sentence Structure",
        hsk_level: 1,
        title: "Basic Sentence Structure",
        prerequisites: [],
        status: "TODO",
      },
    ]);

    renderWithStore(<GrammarPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Basic Sentence Structure/ }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("HSK 1")).toBeInTheDocument();
    expect(screen.getByText("TODO")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    renderWithStore(<GrammarPage />);

    await waitFor(() =>
      expect(
        screen.getByText("Failed to load grammar points."),
      ).toBeInTheDocument(),
    );
  });
});
