import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { renderWithStore } from "../test/renderWithStore";
import ChatPage from "./ChatPage";

const DEFAULT_PROGRESS = [
  { id: "challenge-new-friend", completed: false },
  { id: "challenge-restaurant", completed: false },
  { id: "challenge-taxi", completed: false },
  { id: "challenge-hotel", completed: false },
  { id: "challenge-shop", completed: false },
];

const UNLOCKED_STATE = {
  characters: {
    items: Array.from({ length: 50 }, (_, index) => ({
      char: `字${index}`,
      pinyin: "zi4",
      writting_known: false,
      updated_at: "2026-07-12T12:00:00+00:00",
    })),
  },
  hsk: {
    status: {
      current_level: 2,
      next_level: 3,
      characters_to_next_level: 10,
      progress_to_next_level: 50,
      missing_characters: [],
      max_level: 7,
      completion_ratio: 0.85,
    },
  },
};

function render(ui: ReactElement) {
  return renderWithStore(ui, { preloadedState: UNLOCKED_STATE });
}

function stubProgressFetch(challenges: { id: string; completed: boolean }[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);

      if (url.endsWith("/challenges/progress")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ challenges }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [], completed_task_ids: [] }),
      });
    }),
  );
}

describe("ChatPage", () => {
  beforeEach(() => {
    stubProgressFetch(DEFAULT_PROGRESS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the chat character selection, hiding Xiao Ming until the New Friend challenge is done", () => {
    const { container } = render(<ChatPage />);

    const characterGrid = container.querySelector(
      ".chat-character-grid",
    ) as HTMLElement;

    expect(screen.getByRole("heading", { name: "Chat" })).toBeInTheDocument();
    expect(
      screen.getByText("Who do you want to speak with today?"),
    ).toBeInTheDocument();
    expect(
      within(characterGrid).getByRole("button", { name: /Teacher Wang/ }),
    ).toBeInTheDocument();
    expect(within(characterGrid).getByText("(王老师)")).toBeInTheDocument();
    expect(
      screen.getByText("The native Chinese teacher who can also speak English"),
    ).toBeInTheDocument();
    expect(
      within(characterGrid).queryByRole("button", { name: /Xiao Ming/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the Challenges section in order, with New Friend (Xiao Ming) first", () => {
    render(<ChatPage />);

    expect(
      screen.getByRole("heading", { name: "Challenges" }),
    ).toBeInTheDocument();

    const challengeButtons = [
      screen.getByRole("button", { name: /Xiao Ming/ }),
      screen.getByRole("button", { name: /Waiter/ }),
      screen.getByRole("button", { name: /Taxi Driver/ }),
      screen.getByRole("button", { name: /Hotel Receptionist/ }),
      screen.getByRole("button", { name: /Shop Assistant/ }),
    ];
    for (let index = 0; index < challengeButtons.length - 1; index += 1) {
      expect(
        challengeButtons[index].compareDocumentPosition(
          challengeButtons[index + 1],
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    expect(screen.getByText("(小明)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Meet Xiao Ming for the first time and introduce yourself in Chinese",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("(服务员)")).toBeInTheDocument();
    expect(
      screen.getByText("Talk with the waiter and order a meal"),
    ).toBeInTheDocument();
    expect(screen.getByText("(出租车司机)")).toBeInTheDocument();
    expect(
      screen.getByText("Take a taxi and tell the driver where to go"),
    ).toBeInTheDocument();
    expect(screen.getByText("(前台)")).toBeInTheDocument();
    expect(
      screen.getByText("Check in at a hotel and ask about breakfast"),
    ).toBeInTheDocument();
    expect(screen.getByText("(售货员)")).toBeInTheDocument();
    expect(
      screen.getByText("Buy a shirt and practice shopping vocabulary"),
    ).toBeInTheDocument();
  });

  it("marks completed challenges on the card", async () => {
    stubProgressFetch([
      { id: "challenge-new-friend", completed: false },
      { id: "challenge-restaurant", completed: true },
      { id: "challenge-taxi", completed: false },
      { id: "challenge-hotel", completed: false },
      { id: "challenge-shop", completed: false },
    ]);

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

  it("opens the taxi challenge chat modal with tasks", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: /Taxi Driver/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Taxi Driver \(出租车司机\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Taxi Driver — tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Hail the taxi")).toBeDisabled();
    expect(
      screen.getByLabelText("Tell the driver your destination"),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Ask how much the ride costs"),
    ).toBeDisabled();
    expect(screen.getByLabelText("Pay for the ride")).toBeDisabled();
  });

  it("opens the hotel challenge chat modal with tasks", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(
      screen.getByRole("button", { name: /Hotel Receptionist/ }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Hotel Receptionist \(前台\)/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hotel Receptionist — tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Greet the receptionist")).toBeDisabled();
    expect(screen.getByLabelText("Check in to your room")).toBeDisabled();
    expect(
      screen.getByLabelText("Ask what time breakfast starts"),
    ).toBeDisabled();
    expect(screen.getByLabelText("Check out of the hotel")).toBeDisabled();
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

  it("opens the new friend challenge chat modal as Xiao Ming with tasks", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: /Xiao Ming/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Xiao Ming \(小明\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "New Friend — tasks" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Say hi to your new friend")).toBeDisabled();
    expect(
      screen.getByLabelText("Introduce yourself by name"),
    ).toBeDisabled();
    expect(screen.getByLabelText("Tell them your age")).toBeDisabled();
    expect(screen.getByLabelText("Say goodbye")).toBeDisabled();
  });

  it("closes the chat modal", async () => {
    const user = userEvent.setup();

    render(<ChatPage />);

    await user.click(screen.getByRole("button", { name: /Teacher Wang/ }));
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
              { id: "challenge-new-friend", completed: false },
              {
                id: "challenge-restaurant",
                completed: callCount > 1,
              },
              { id: "challenge-taxi", completed: false },
              { id: "challenge-hotel", completed: false },
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

  it("unlocks Xiao Ming and hides the New Friend challenge once it is completed", async () => {
    stubProgressFetch([
      { id: "challenge-new-friend", completed: true },
      { id: "challenge-restaurant", completed: false },
      { id: "challenge-taxi", completed: false },
      { id: "challenge-hotel", completed: false },
      { id: "challenge-shop", completed: false },
    ]);

    const { container } = render(<ChatPage />);

    await waitFor(() => {
      const characterGrid = container.querySelector(
        ".chat-character-grid",
      ) as HTMLElement;
      expect(
        within(characterGrid).getByRole("button", { name: /Xiao Ming/ }),
      ).toBeInTheDocument();
    });

    const challengeSection = container.querySelector(
      ".challenge-card-grid",
    ) as HTMLElement;
    expect(within(challengeSection).getAllByRole("button")).toHaveLength(4);
    expect(
      within(challengeSection).queryByText("(小明)"),
    ).not.toBeInTheDocument();
  });

  it("shows a knowledge base banner and hides Xiao Ming and challenges below 50 characters", () => {
    renderWithStore(<ChatPage onNavigate={vi.fn()} />, {
      preloadedState: {
        characters: { items: [] },
        hsk: { status: null },
      },
    });

    expect(
      screen.getByText(/Build your knowledge base to unlock more people/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Teacher Wang/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Xiao Ming/ }),
    ).not.toBeInTheDocument();
  });

  it("navigates to the knowledge base page from the banner", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithStore(<ChatPage onNavigate={onNavigate} />, {
      preloadedState: {
        characters: { items: [] },
        hsk: { status: null },
      },
    });

    await user.click(
      screen.getByRole("button", { name: "Go to knowledge base" }),
    );

    expect(onNavigate).toHaveBeenCalledWith("knowledge-base");
  });

  it("hides challenges above the user's achieved HSK level, keeping HSK0 New Friend visible", () => {
    renderWithStore(<ChatPage />, {
      preloadedState: {
        ...UNLOCKED_STATE,
        hsk: { status: { ...UNLOCKED_STATE.hsk.status, current_level: 1 } },
      },
    });

    expect(
      screen.queryByRole("button", { name: /Waiter/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Xiao Ming/ }),
    ).toBeInTheDocument();
  });
});
