import { render, screen, waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WritingPracticeDetailPage from "./WritingPracticeDetailPage";

type SentenceCheckResponse = { severity: string; answer?: string };
type CoveredGrammarPointResponse = { id: string; title: string };

function stubApiFetch(handlers: {
  checkSentence?: (text: string) => SentenceCheckResponse | Promise<SentenceCheckResponse>;
  detectGrammarPoints?: (text: string) => CoveredGrammarPointResponse[];
  savedDraft?: string;
}) {
  const detectGrammarPointCalls: string[] = [];
  const recordUsageCalls: string[][] = [];
  const chatCalls: unknown[] = [];
  const saveDraftCalls: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (url.includes("/writing/draft/") && method === "GET") {
        return { ok: true, json: async () => ({ draft: handlers.savedDraft ?? "", archive: [] }) };
      }
      if (url.includes("/writing/draft/") && method === "POST") {
        saveDraftCalls.push(body.draft);
        return { ok: true, json: async () => ({ draft: body.draft, archive: [] }) };
      }
      if (url.endsWith("/writing/check-sentence")) {
        const result = (await handlers.checkSentence?.(body.text)) ?? { severity: "none" };
        return { ok: true, json: async () => result };
      }
      if (url.endsWith("/grammar-points/detect")) {
        detectGrammarPointCalls.push(body.text);
        const grammar_points_covered = handlers.detectGrammarPoints?.(body.text) ?? [];
        return { ok: true, json: async () => ({ grammar_points_covered }) };
      }
      if (url.endsWith("/grammar-points/record-usage")) {
        recordUsageCalls.push(body.grammar_ids);
        return { ok: true, json: async () => ({ new_grammar_points_mastered: [] }) };
      }
      if (url.endsWith("/chat") && method === "POST") {
        chatCalls.push(body);
        return {
          ok: true,
          json: async () => ({ message: { role: "assistant", content: "Follow-up reply." } }),
        };
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }),
  );

  return { detectGrammarPointCalls, recordUsageCalls, chatCalls, saveDraftCalls };
}

describe("WritingPracticeDetailPage", () => {
  it("shows the topic title and its context by default", () => {
    render(
      <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", { name: "Present yourself" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Context", selected: true })).toBeInTheDocument();
    expect(screen.getByText(/Write a short introduction of yourself/)).toBeInTheDocument();
    expect(screen.getByText("Grammar you can use")).toBeInTheDocument();
  });

  it("shows a fallback message when a topic has no context file", () => {
    render(<WritingPracticeDetailPage topicId="writing-unknown" onBack={vi.fn()} />);

    expect(screen.getByText("No context available yet.")).toBeInTheDocument();
  });

  it("switches to the writing tab and lets the user type multi-line text", async () => {
    const user = userEvent.setup();
    render(
      <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
    );

    await user.click(screen.getByRole("tab", { name: "Writing" }));

    const textarea = screen.getByLabelText("Your writing");
    expect(textarea).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();

    await user.type(textarea, "你好{Enter}再见");
    expect(textarea).toHaveValue("你好\n再见");
  });

  it("calls onBack when the back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={onBack} />,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalled();
  });

  describe("draft", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("loads a saved draft into the textarea when the topic is opened", async () => {
      stubApiFetch({ savedDraft: "我叫小明。" });

      const user = userEvent.setup();
      render(
        <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
      );
      await user.click(screen.getByRole("tab", { name: "Writing" }));

      expect(await screen.findByLabelText("Your writing")).toHaveValue("我叫小明。");
    });

    it("saves the current draft when Save draft is clicked", async () => {
      const user = userEvent.setup();
      const { saveDraftCalls } = stubApiFetch({});
      render(
        <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
      );
      await user.click(screen.getByRole("tab", { name: "Writing" }));
      await user.type(screen.getByLabelText("Your writing"), "我叫小明。");

      await user.click(screen.getByRole("button", { name: "Save draft" }));

      await waitFor(() => expect(saveDraftCalls).toEqual(["我叫小明。"]));
    });

    it("shows an error when saving the draft fails", async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method ?? "GET";
          if (url.includes("/writing/draft/") && method === "GET") {
            return { ok: true, json: async () => ({ draft: "", archive: [] }) };
          }
          return { ok: false };
        }),
      );
      render(
        <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
      );
      await user.click(screen.getByRole("tab", { name: "Writing" }));
      await user.type(screen.getByLabelText("Your writing"), "我叫小明。");

      await user.click(screen.getByRole("button", { name: "Save draft" }));

      expect(await screen.findByText("Failed to save your draft.")).toBeInTheDocument();
    });
  });

  describe("submitting", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function typeAndSubmit(text: string) {
      const user = userEvent.setup();
      render(
        <WritingPracticeDetailPage topicId="writing-present-yourself" onBack={vi.fn()} />,
      );
      await user.click(screen.getByRole("tab", { name: "Writing" }));
      await user.type(screen.getByLabelText("Your writing"), text);
      await user.click(screen.getByRole("button", { name: "Submit" }));
      return user;
    }

    it("makes the text non-editable, shows an under-review message, then colors a correct sentence green", async () => {
      let resolveCheck!: (value: SentenceCheckResponse) => void;
      const pendingCheck = new Promise<SentenceCheckResponse>((resolve) => {
        resolveCheck = resolve;
      });
      stubApiFetch({ checkSentence: () => pendingCheck });

      await typeAndSubmit("我是学生。");

      expect(screen.queryByRole("textbox", { name: "Your writing" })).not.toBeInTheDocument();
      expect(screen.getByText("Your text is currently under review...")).toBeInTheDocument();

      resolveCheck({ severity: "none" });

      await waitForElementToBeRemoved(() =>
        screen.queryByText("Your text is currently under review..."),
      );

      const sentence = await screen.findByText("我是学生。");
      expect(sentence.className).toContain("writing-sentence--none");
    });

    it("colors sentences by severity: minor, awkward, and incorrect", async () => {
      stubApiFetch({
        checkSentence: (text) => {
          if (text === "第一句。") return { severity: "minor", answer: "nitpick" };
          if (text === "第二句。") return { severity: "awkward", answer: "odd phrasing" };
          return { severity: "incorrect", answer: "wrong" };
        },
      });

      await typeAndSubmit("第一句。第二句。第三句。");

      await waitFor(() =>
        expect(screen.getByText("第一句。").className).toContain("writing-sentence--minor"),
      );
      expect(screen.getByText("第二句。").className).toContain("writing-sentence--awkward");
      expect(screen.getByText("第三句。").className).toContain("writing-sentence--incorrect");
    });

    it("detects used grammar rules only when a sentence is correct", async () => {
      const { detectGrammarPointCalls } = stubApiFetch({
        checkSentence: (text) =>
          text === "我是学生。" ? { severity: "none" } : { severity: "incorrect", answer: "x" },
      });

      await typeAndSubmit("我是学生。错误句子。");

      await waitFor(() =>
        expect(screen.queryByText("Your text is currently under review...")).not
          .toBeInTheDocument(),
      );

      expect(detectGrammarPointCalls).toEqual(["我是学生。"]);
    });

    it("opens an ephemeral Teacher Wang chat explaining the mistake when a flawed sentence is clicked", async () => {
      const user = userEvent.setup();
      const { chatCalls } = stubApiFetch({
        checkSentence: (text) =>
          text === "我是学生。"
            ? { severity: "none" }
            : { severity: "incorrect", answer: "Missing a measure word." },
      });

      await typeAndSubmit("我是学生。我买书。");

      await waitFor(() =>
        expect(screen.getByText("我买书。").className).toContain("writing-sentence--incorrect"),
      );
      // Dismiss the auto-opened review summary modal first.
      await user.click(screen.getByRole("button", { name: "OK" }));

      await user.click(screen.getByRole("button", { name: "我买书。" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Missing a measure word.")).toBeInTheDocument();
      // The explanation is a scripted display bubble, not a real API call.
      expect(chatCalls).toEqual([]);

      await user.type(screen.getByLabelText("Message"), "Why?");
      await user.click(screen.getByRole("button", { name: "Send" }));

      expect(await screen.findByText("Follow-up reply.")).toBeInTheDocument();
      expect(chatCalls).toHaveLength(1);
      expect(chatCalls[0]).toMatchObject({ character_id: "teacher-wang", ephemeral: true });
      expect((chatCalls[0] as { context: string }).context).toContain("我买书。");
      expect((chatCalls[0] as { context: string }).context).toContain(
        "Missing a measure word.",
      );
    });

    it("does not make a correct sentence clickable", async () => {
      stubApiFetch({ checkSentence: () => ({ severity: "none" }) });

      await typeAndSubmit("我是学生。");

      const sentence = await screen.findByText("我是学生。");
      expect(sentence).not.toHaveAttribute("role", "button");
    });

    it("opens a success review modal listing validated grammar points when everything is correct", async () => {
      const { recordUsageCalls } = stubApiFetch({
        checkSentence: () => ({ severity: "none" }),
        detectGrammarPoints: () => [{ id: "hsk1_existence_with_you", title: "Existence with 有" }],
      });

      await typeAndSubmit("我有一本书。");

      expect(
        await screen.findByRole("heading", { name: "Everything is correct!" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Well done — your text has no grammar mistakes."),
      ).toBeInTheDocument();
      expect(screen.getByText("Existence with 有")).toBeInTheDocument();
      expect(screen.getByRole("dialog").className).not.toContain("modal-dialog--warning");
      // Usage is only recorded once the whole text is correct.
      await waitFor(() =>
        expect(recordUsageCalls).toEqual([["hsk1_existence_with_you"]]),
      );
    });

    it("opens a warning review modal telling the user to fix mistakes when some sentences are wrong, without recording any usage yet", async () => {
      const { recordUsageCalls } = stubApiFetch({
        checkSentence: (text) =>
          text === "我有一本书。"
            ? { severity: "none" }
            : { severity: "incorrect", answer: "x" },
        detectGrammarPoints: () => [{ id: "hsk1_existence_with_you", title: "Existence with 有" }],
      });

      await typeAndSubmit("我有一本书。错误句子。");

      expect(await screen.findByRole("heading", { name: "Almost there" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "Some sentences still have grammar mistakes. Click them to see why, then fix them to validate the text.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Existence with 有")).toBeInTheDocument();
      expect(screen.getByRole("dialog").className).toContain("modal-dialog--warning");
      expect(recordUsageCalls).toEqual([]);
    });

    it("closes the review modal when its OK button is clicked", async () => {
      const user = userEvent.setup();
      stubApiFetch({ checkSentence: () => ({ severity: "none" }) });

      await typeAndSubmit("我是学生。");

      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "OK" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows an edit button only next to flawed sentences", async () => {
      stubApiFetch({
        checkSentence: (text) =>
          text === "我是学生。" ? { severity: "none" } : { severity: "incorrect", answer: "x" },
      });

      await typeAndSubmit("我是学生。我买书。");
      await waitFor(() =>
        expect(screen.getByText("我买书。").className).toContain("writing-sentence--incorrect"),
      );

      expect(
        screen.queryByRole("button", { name: "Correct: 我是学生。" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Correct: 我买书。" })).toBeInTheDocument();
    });

    it("re-checks a corrected sentence, detects its grammar points, and records usage once it becomes correct", async () => {
      const user = userEvent.setup();
      const { detectGrammarPointCalls, recordUsageCalls } = stubApiFetch({
        checkSentence: (text) =>
          text === "我买了一本书。"
            ? { severity: "none" }
            : { severity: "incorrect", answer: "Missing a measure word." },
        detectGrammarPoints: () => [{ id: "hsk1_existence_with_you", title: "Existence with 有" }],
      });

      await typeAndSubmit("我买书。");
      await screen.findByRole("heading", { name: "Almost there" });
      await user.click(screen.getByRole("button", { name: "OK" }));

      await user.click(screen.getByRole("button", { name: "Correct: 我买书。" }));

      const textarea = screen.getByRole("textbox", { name: "Your correction" });
      expect(textarea).toHaveValue("我买书。");
      await user.clear(textarea);
      await user.type(textarea, "我买了一本书。");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(screen.getByText("我买了一本书。").className).toContain(
          "writing-sentence--none",
        ),
      );
      expect(detectGrammarPointCalls).toEqual(["我买了一本书。"]);
      await waitFor(() =>
        expect(recordUsageCalls).toEqual([["hsk1_existence_with_you"]]),
      );
    });

    it("shows the success review modal once the last flawed sentence is corrected", async () => {
      const user = userEvent.setup();
      stubApiFetch({
        checkSentence: (text) =>
          text === "我买书。" ? { severity: "incorrect", answer: "x" } : { severity: "none" },
      });

      await typeAndSubmit("我买书。");
      await screen.findByRole("heading", { name: "Almost there" });
      await user.click(screen.getByRole("button", { name: "OK" }));

      await user.click(screen.getByRole("button", { name: "Correct: 我买书。" }));
      const textarea = screen.getByRole("textbox", { name: "Your correction" });
      await user.clear(textarea);
      await user.type(textarea, "我买了一本书。");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByRole("heading", { name: "Everything is correct!" }),
      ).toBeInTheDocument();
    });
  });
});
