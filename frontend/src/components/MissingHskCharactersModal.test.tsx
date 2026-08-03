import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MissingHskCharactersModal from "./MissingHskCharactersModal";

describe("MissingHskCharactersModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens related HSK words for the target level when a character is clicked", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: "爱|ai4",
              word: "爱",
              level: 1,
              frequency: 10,
              pinyin: "ai4",
              definition: "to love",
            },
            {
              id: "爱好|ai4 hao4",
              word: "爱好",
              level: 1,
              frequency: 20,
              pinyin: "ai4 hao4",
              definition: "hobby",
            },
          ],
        }),
      ),
    );

    render(
      <MissingHskCharactersModal
        isOpen
        level={1}
        characters={["爱", "好"]}
        onClose={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "爱" }));

    expect(
      await screen.findByRole("heading", { name: "爱" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Related HSK words (up to level 1):")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("爱好 (ai4 hao4)")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/hsk-characters/%E7%88%B1/words?level=1",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
