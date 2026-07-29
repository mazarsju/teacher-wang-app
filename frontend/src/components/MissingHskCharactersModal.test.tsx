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
            { word: "爱", level: 1, frequency: 10 },
            { word: "爱好", level: 1, frequency: 20 },
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
      expect(screen.getByText("爱好")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/hsk-characters/%E7%88%B1/words?level=1",
      { method: "GET" },
    );
  });
});
