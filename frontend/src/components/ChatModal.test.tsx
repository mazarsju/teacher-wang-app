import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatModal from "./ChatModal";
import type { ChatCharacter } from "./ChatCharacterCard";

const teacherWang: ChatCharacter = {
  id: "teacher-wang",
  name: "Teacher Wang",
  chineseName: "王老师",
  description: "The native Chinese teacher who can also speak English",
  avatarVariant: "teacher",
};

describe("ChatModal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: {
                role: "assistant",
                content: "你好！",
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a message and displays the assistant reply", async () => {
    const user = userEvent.setup();

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    expect(
      await screen.findByText("Start a conversation with Teacher Wang."),
    ).toBeInTheDocument();

    const input = screen.getByLabelText("Message");
    await user.type(input, "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(input).toHaveFocus();
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    expect(await screen.findByText("你好！")).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(fetch).toHaveBeenCalledWith(
      "/api/conversation-logs/teacher-wang",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          character_id: "teacher-wang",
          messages: [{ role: "user", content: "Hello" }],
        }),
      }),
    );
  });

  it("checks grammar point usage when the correction severity is none", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: { role: "assistant", content: "你好！" },
              correction: { severity: "none" },
            }),
          });
        }

        if (url.endsWith("/grammar-points/check") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              grammar_points_covered: [],
              new_grammar_points_mastered: [],
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "我很好");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("你好！")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/grammar-points/check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "我很好" }),
      }),
    );
  });

  it("opens a mastery modal listing newly mastered grammar points", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: { role: "assistant", content: "你好！" },
              correction: { severity: "none" },
            }),
          });
        }

        if (url.endsWith("/grammar-points/check") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              grammar_points_covered: ["Ba construction"],
              new_grammar_points_mastered: ["Ba construction"],
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "我把书放下了");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Grammar mastered!")).toBeInTheDocument();
    expect(screen.getByText("Ba construction")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nice!" }));
    expect(screen.queryByText("Grammar mastered!")).not.toBeInTheDocument();
  });

  it("loads and displays saved chat history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messages: [
                { role: "user", content: "Earlier message" },
                { role: "assistant", content: "Earlier reply" },
              ],
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    expect(await screen.findByText("Earlier message")).toBeInTheDocument();
    expect(screen.getByText("Earlier reply")).toBeInTheDocument();
  });

  it("restores grammar warning from saved chat history", async () => {
    const user = userEvent.setup();
    const xiaoMing: ChatCharacter = {
      id: "xiao-ming",
      name: "Xiao Ming",
      chineseName: "小明",
      description: "Your native Chinese friend",
      avatarVariant: "friend",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/xiao-ming") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messages: [
                {
                  role: "user",
                  content: "我是很好",
                  correctionAnswer: "Say 我很好 instead of 我是很好.",
                  correctionThreadId: "thread123",
                  correctionSeverity: "incorrect",
                  correctionThread: [
                    {
                      role: "assistant",
                      content: "Say 我很好 instead of 我是很好.",
                    },
                  ],
                },
                { role: "assistant", content: "我也很好！" },
              ],
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(<ChatModal character={xiaoMing} onClose={() => undefined} />);

    expect(await screen.findByText("我是很好")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Open grammar note (Incorrect) with Teacher Wang",
      }),
    );
    expect(
      screen.getByRole("heading", { name: /Incorrect/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Say 我很好 instead of 我是很好."),
    ).toBeInTheDocument();
  });

  it("clears chat history after confirmation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messages: [
                { role: "user", content: "Earlier message" },
                { role: "assistant", content: "Earlier reply" },
              ],
            }),
          });
        }

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "DELETE") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ message: "Chat history cleared" }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    expect(await screen.findByText("Earlier message")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear chat history" }));

    expect(
      screen.getByText(
        "Clear all chat history with Teacher Wang? This cannot be undone.",
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/conversation-logs/teacher-wang",
      expect.objectContaining({ method: "DELETE" }),
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Start a conversation with Teacher Wang."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/conversation-logs/teacher-wang",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("keeps chat history when clear confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messages: [
                { role: "user", content: "Earlier message" },
                { role: "assistant", content: "Earlier reply" },
              ],
            }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        });
      }),
    );

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    expect(await screen.findByText("Earlier message")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear chat history" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Earlier message")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/conversation-logs/teacher-wang",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("shows an error when the chat request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "LLM_API_KEY must be set" }),
        });
      }),
    );

    const user = userEvent.setup();

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("LLM_API_KEY must be set"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("Hello");
  });

  it("shows a clear message when the free plan is out of tokens", async () => {
    const exhaustedMessage =
      "Sorry, you've used up the tokens included with your free plan. If you're enjoying chat, consider upgrading to a paid account!";

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({ error: exhaustedMessage }),
        });
      }),
    );

    const user = userEvent.setup();

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "你好");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(exhaustedMessage)).toBeInTheDocument();
  });

  it("opens a Teacher Wang correction chat from the grammar warning", async () => {
    const user = userEvent.setup();
    const xiaoMing: ChatCharacter = {
      id: "xiao-ming",
      name: "Xiao Ming",
      chineseName: "小明",
      description: "Your native Chinese friend",
      avatarVariant: "friend",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/xiao-ming") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: {
                role: "assistant",
                content: "我也很好！",
              },
              correction: {
                severity: "incorrect",
                answer: "Say 我很好 instead of 我是很好.",
                thread_id: "thread123",
                thread_messages: [
                  {
                    role: "assistant",
                    content: "Say 我很好 instead of 我是很好.",
                  },
                ],
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

    render(<ChatModal character={xiaoMing} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "我是很好");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("我是很好")).toBeInTheDocument();
    expect(screen.getByText("我也很好！")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Open grammar note (Incorrect) with Teacher Wang",
      }),
    );

    expect(
      screen.getByRole("heading", { name: /Teacher Wang/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Incorrect/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Say 我很好 instead of 我是很好."),
    ).toBeInTheDocument();
  });

  it("ticks challenge tasks from the judge response", async () => {
    const user = userEvent.setup();
    const waiter: ChatCharacter = {
      id: "challenge-restaurant",
      name: "Waiter",
      chineseName: "服务员",
      description: "Talk with the waiter and order a meal",
      avatarVariant: "waiter",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (
          url.endsWith("/conversation-logs/challenge-restaurant") &&
          method === "GET"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messages: [],
              completed_task_ids: [],
            }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: {
                role: "assistant",
                content: "您好，请稍等。",
              },
              completed_task_ids: ["call-waiter"],
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
      <ChatModal
        character={waiter}
        onClose={() => undefined}
        tasks={[
          { id: "call-waiter", label: "Call the waiter" },
          { id: "ask-bill", label: "Ask for the bill" },
        ]}
        challengeTitle="Waiter"
      />,
    );

    expect(await screen.findByLabelText("Call the waiter")).not.toBeChecked();
    expect(screen.getByLabelText("Call the waiter")).toBeDisabled();

    await user.type(screen.getByLabelText("Message"), "服务员！");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("您好，请稍等。")).toBeInTheDocument();
    expect(screen.getByLabelText("Call the waiter")).toBeChecked();
    expect(screen.getByLabelText("Ask for the bill")).not.toBeChecked();
  });

  it("renders bracketed assistant messages as italic stage directions", async () => {
    const user = userEvent.setup();
    const waiter: ChatCharacter = {
      id: "challenge-restaurant",
      name: "Waiter",
      chineseName: "服务员",
      description: "Talk with the waiter and order a meal",
      avatarVariant: "waiter",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (
          url.endsWith("/conversation-logs/challenge-restaurant") &&
          method === "GET"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [], completed_task_ids: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: {
                role: "assistant",
                content: "[[The waiter needs to be called to come]]",
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

    render(<ChatModal character={waiter} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "你好");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const stage = await screen.findByText(
      "The waiter needs to be called to come",
    );
    expect(stage).toHaveClass("chat-message-stage");
    expect(
      screen.queryByText("[[The waiter needs to be called to come]]"),
    ).not.toBeInTheDocument();
  });

  it("renders markdown emphasis in message content as HTML", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: {
                role: "assistant",
                content: "This is **correct** and `很好`!",
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

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "你好");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("correct", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(screen.getByText("很好", { selector: "code" })).toBeInTheDocument();
  });

  it("renders markdown headers in message content as heading elements", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/conversation-logs/teacher-wang") && method === "GET") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: {
                role: "assistant",
                content: "# Title\n## Subtitle\nRegular line",
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

    render(<ChatModal character={teacherWang} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "你好");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Title", { selector: "h1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Subtitle", { selector: "h2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Regular line")).toBeInTheDocument();
  });

  it("renders stage directions found anywhere in an assistant message", async () => {
    const user = userEvent.setup();
    const waiter: ChatCharacter = {
      id: "challenge-restaurant",
      name: "Waiter",
      chineseName: "服务员",
      description: "Talk with the waiter and order a meal",
      avatarVariant: "waiter",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (
          url.endsWith("/conversation-logs/challenge-restaurant") &&
          method === "GET"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ messages: [], completed_task_ids: [] }),
          });
        }

        if (url.endsWith("/chat") && method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              message: {
                role: "assistant",
                content:
                  "[[The waiter leaves]][[The waiter comes back with the ordered meal]]您的菜来了。",
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

    render(<ChatModal character={waiter} onClose={() => undefined} />);

    await user.type(screen.getByLabelText("Message"), "买单");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("The waiter leaves")).toHaveClass(
      "chat-message-stage",
    );
    expect(
      screen.getByText("The waiter comes back with the ordered meal"),
    ).toHaveClass("chat-message-stage");
    expect(screen.getByText("您的菜来了。")).toHaveClass(
      "chat-message--assistant",
    );
  });

  it("shows a challenge completed banner when all tasks are done", async () => {
    const waiter: ChatCharacter = {
      id: "challenge-restaurant",
      name: "Waiter",
      chineseName: "服务员",
      description: "Talk with the waiter and order a meal",
      avatarVariant: "waiter",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (
          url.endsWith("/conversation-logs/challenge-restaurant") &&
          method === "GET"
        ) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              messages: [{ role: "user", content: "谢谢" }],
              completed_task_ids: ["call-waiter", "ask-bill"],
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
      <ChatModal
        character={waiter}
        onClose={() => undefined}
        tasks={[
          { id: "call-waiter", label: "Call the waiter" },
          { id: "ask-bill", label: "Ask for the bill" },
        ]}
        challengeTitle="Waiter"
      />,
    );

    expect(
      await screen.findByText("Challenge completed!"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  });

  it("auto-sends a seeded context message on open, showing it as background text (not a bubble) with a typing indicator until the reply arrives", async () => {
    let resolveChat: (value: unknown) => void = () => {};
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat") && (init?.method ?? "GET") === "POST") {
        return new Promise((resolve) => {
          resolveChat = resolve;
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <ChatModal
        character={teacherWang}
        onClose={() => undefined}
        initialMessages={[
          {
            role: "user",
            isContext: true,
            content: "**Question:** why is 我是很好 wrong?",
          },
        ]}
        loadHistory={false}
        autoSendInitialMessage
        ephemeral
      />,
    );

    const contextText = await screen.findByText(/why is 我是很好 wrong\?/);
    expect(contextText).toHaveClass("chat-message-stage");
    expect(container.querySelector(".chat-message--user")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Teacher Wang is typing..."),
    ).toBeInTheDocument();

    resolveChat({
      ok: true,
      json: async () => ({
        message: { role: "assistant", content: "是 links nouns, not adjectives." },
      }),
    });

    expect(
      await screen.findByText("是 links nouns, not adjectives."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Teacher Wang is typing..."),
    ).not.toBeInTheDocument();

    const [, init] = fetchMock.mock.calls.find(
      ([callUrl]) => String(callUrl).endsWith("/chat"),
    )!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ character_id: "teacher-wang", ephemeral: true });
    expect(body.messages).toEqual([
      { role: "user", content: "**Question:** why is 我是很好 wrong?" },
    ]);
  });

  it("shows an isDisplayOnly seed message as a normal bubble but never sends it, and forwards topicContext", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/chat") && (init?.method ?? "GET") === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            message: { role: "assistant", content: "是 means 'to be'." },
          }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatModal
        character={teacherWang}
        onClose={() => undefined}
        initialMessages={[
          {
            role: "assistant",
            content: "Ask me what you did not understand on this lesson!",
            isDisplayOnly: true,
          },
        ]}
        loadHistory={false}
        allowClearHistory={false}
        ephemeral
        topicContext={"# The verb 是\n是 means 'to be' and links two nouns."}
      />,
    );

    expect(
      screen.getByText("Ask me what you did not understand on this lesson!"),
    ).toHaveClass("chat-message--assistant");
    // Nothing sent yet: the greeting is display-only, not auto-sent.
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Message"), "Why does 是 work here?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("是 means 'to be'.")).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: "user", content: "Why does 是 work here?" },
    ]);
    expect(body.context).toBe(
      "# The verb 是\n是 means 'to be' and links two nouns.",
    );
  });
});
