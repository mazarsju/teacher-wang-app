import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatPage from "./ChatPage";

describe("ChatPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);

        if (url.endsWith("/challenges/progress")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              challenges: [
                { id: "challenge-restaurant", completed: false },
                { id: "challenge-shop", completed: false },
              ],
            }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [], completed_task_ids: [] }),
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the chat character selection", () => {
    render(<ChatPage />);

    expect(screen.getByRole("heading", { name: "Chat" })).toBeInTheDocument();
    expect(
      screen.getByText("Who do you want to speak with today?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Teacher Wang/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("(王老师)")).toBeInTheDocument();
    expect(
      screen.getByText("The native Chinese teacher who can also speak English"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Xiao Ming/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("(小明)")).toBeInTheDocument();
    expect(screen.getByText("Your native Chinese friend")).toBeInTheDocument();
  });

  it("renders the Challenges section", () => {
    render(<ChatPage />);

    expect(
      screen.getByRole("heading", { name: "Challenges" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Waiter/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("(服务员)")).toBeInTheDocument();
    expect(
      screen.getByText("Talk with the waiter and order a meal"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Shop Assistant/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("(售货员)")).toBeInTheDocument();
    expect(
      screen.getByText("Buy a shirt and practice shopping vocabulary"),
    ).toBeInTheDocument();
  });

  it("marks completed challenges on the card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);

        if (url.endsWith("/challenges/progress")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              challenges: [
                { id: "challenge-restaurant", completed: true },
                { id: "challenge-shop", completed: false },
              ],
            }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [], completed_task_ids: [] }),
        });
      }),
    );

    render(<ChatPage />);

    expect(
      await screen.findByRole("button", {
        name: /Waiter \(服务员\), completed/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("opens a chat modal when a character card is selected", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: /Teacher Wang/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Teacher Wang/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Start a conversation with Teacher Wang."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
  });

  it("opens a challenge chat modal with tasks", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: /Waiter/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Waiter \(服务员\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Waiter — tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Call the waiter")).toBeDisabled();
    expect(screen.getByLabelText("Call the waiter")).not.toBeChecked();
  });

  it("opens the shop challenge chat modal with tasks", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: /Shop Assistant/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Shop Assistant \(售货员\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Shop Assistant — tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Greet the shop assistant")).toBeDisabled();
    expect(
      screen.getByLabelText("Ask the price of a shirt"),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Ask for a different size"),
    ).toBeDisabled();
    expect(screen.getByLabelText("Pay for the item")).toBeDisabled();
  });

  it("closes the chat modal", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: /Xiao Ming/ }));
    await user.click(screen.getByRole("button", { name: "Close chat" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refreshes challenge progress after closing a challenge modal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);

      if (url.endsWith("/challenges/progress")) {
        const callCount = fetchMock.mock.calls.filter((call) =>
          String(call[0]).endsWith("/challenges/progress"),
        ).length;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            challenges: [
              {
                id: "challenge-restaurant",
                completed: callCount > 1,
              },
              { id: "challenge-shop", completed: false },
            ],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [], completed_task_ids: [] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatPage />);
    await user.click(screen.getByRole("button", { name: /Waiter/ }));
    await user.click(screen.getByRole("button", { name: "Close chat" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Waiter \(服务员\), completed/,
        }),
      ).toBeInTheDocument();
    });
  });
});
