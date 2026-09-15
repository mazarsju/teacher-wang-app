import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListeningWritingBonus from "./ListeningWritingBonus";
import { renderWithStore } from "../test/renderWithStore";

type SentenceCheckResponse = { severity: string; answer?: string };

function stubApiFetch(handlers: {
  checkSentence?: (text: string) => SentenceCheckResponse | Promise<SentenceCheckResponse>;
  detectGrammarPoints?: (text: string) => { id: string; title: string }[];
  onTopic?: boolean | ((text: string) => boolean);
}) {
  const topicRelevanceCalls: string[] = [];
  const checkSentenceCalls: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (url.endsWith("/writing/check-topic-relevance")) {
        topicRelevanceCalls.push(body.text);
        const onTopic =
          typeof handlers.onTopic === "function"
            ? handlers.onTopic(body.text)
            : (handlers.onTopic ?? true);
        return { ok: true, json: async () => ({ on_topic: onTopic }) };
      }
      if (url.endsWith("/writing/check-sentence")) {
        checkSentenceCalls.push(body.text);
        const result = (await handlers.checkSentence?.(body.text)) ?? { severity: "none" };
        return { ok: true, json: async () => result };
      }
      if (url.endsWith("/grammar-points/check") && body.check_only) {
        const grammar_points_covered = handlers.detectGrammarPoints?.(body.text) ?? [];
        return { ok: true, json: async () => ({ grammar_points_covered }) };
      }
      if (url.endsWith("/grammar-points/record-usage")) {
        return {
          ok: true,
          json: async () => ({ new_grammar_points_mastered: [], updated_grammar_points: [] }),
        };
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }),
  );

  return { topicRelevanceCalls, checkSentenceCalls };
}

describe("ListeningWritingBonus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets the learner type a multi-line answer and submit it", async () => {
    const user = userEvent.setup();
    stubApiFetch({ checkSentence: () => ({ severity: "none" }) });

    renderWithStore(<ListeningWritingBonus question="Describe your family." />);

    const textarea = screen.getByLabelText("Your answer");
    await user.type(textarea, "我家有五个人。");
    expect(textarea).toHaveValue("我家有五个人。");

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(
      await screen.findByRole("heading", { name: "Everything is correct!" }),
    ).toBeInTheDocument();
  });

  it("checks whether the answer addresses the question before reviewing it", async () => {
    const { topicRelevanceCalls } = stubApiFetch({ checkSentence: () => ({ severity: "none" }) });
    const user = userEvent.setup();
    renderWithStore(<ListeningWritingBonus question="Describe your family." />);

    await user.type(screen.getByLabelText("Your answer"), "我家有五个人。");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(topicRelevanceCalls).toEqual(["我家有五个人。"]),
    );
  });

  it("shows a warning instead of reviewing the text when it's off topic", async () => {
    stubApiFetch({ onTopic: false });
    const user = userEvent.setup();
    renderWithStore(<ListeningWritingBonus question="Describe your family." />);

    await user.type(screen.getByLabelText("Your answer"), "你好！");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Warning")).toBeInTheDocument();
    expect(
      screen.getByText(/doesn't seem to answer this question/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("你好！");
  });

  it("colors an incorrect sentence and lets the learner correct it", async () => {
    const { checkSentenceCalls } = stubApiFetch({
      checkSentence: (text) =>
        text === "我有五个人家。" ? { severity: "incorrect", answer: "Word order is off." } : { severity: "none" },
    });
    const user = userEvent.setup();
    renderWithStore(<ListeningWritingBonus question="Describe your family." />);

    await user.type(screen.getByLabelText("Your answer"), "我有五个人家。");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByRole("heading", { name: "Almost there" });
    await user.click(screen.getByRole("button", { name: "OK" }));

    const sentence = screen.getByText("我有五个人家。");
    expect(sentence.className).toContain("bonus-sentence--incorrect");

    await user.click(screen.getByRole("button", { name: "Correct: 我有五个人家。" }));
    const correctionTextarea = screen.getByRole("textbox", { name: "Your correction" });
    await user.clear(correctionTextarea);
    await user.type(correctionTextarea, "我家有五个人。");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText("我家有五个人。").className).toContain("bonus-sentence--none"),
    );
    expect(checkSentenceCalls).toEqual(["我有五个人家。", "我家有五个人。"]);
  });

  it("keeps the text visible and non-editable after a successful submission, with a Redo exercise button", async () => {
    const user = userEvent.setup();
    stubApiFetch({ checkSentence: () => ({ severity: "none" }) });
    renderWithStore(<ListeningWritingBonus question="Describe your family." />);

    await user.type(screen.getByLabelText("Your answer"), "我家有五个人。");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByRole("heading", { name: "Everything is correct!" });
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(screen.getByText("我家有五个人。")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo exercise" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("resets to a blank, editable textarea when Redo exercise is clicked", async () => {
    const user = userEvent.setup();
    stubApiFetch({ checkSentence: () => ({ severity: "none" }) });
    renderWithStore(<ListeningWritingBonus question="Describe your family." />);

    await user.type(screen.getByLabelText("Your answer"), "我家有五个人。");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByRole("heading", { name: "Everything is correct!" });
    await user.click(screen.getByRole("button", { name: "OK" }));

    await user.click(screen.getByRole("button", { name: "Redo exercise" }));

    expect(screen.queryByText("我家有五个人。")).not.toBeInTheDocument();
    const textarea = screen.getByLabelText("Your answer");
    expect(textarea).toHaveValue("");
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("does not show a Redo exercise button while some sentences are still wrong", async () => {
    const user = userEvent.setup();
    stubApiFetch({ checkSentence: () => ({ severity: "incorrect", answer: "x" }) });
    renderWithStore(<ListeningWritingBonus question="Describe your family." />);

    await user.type(screen.getByLabelText("Your answer"), "错误句子。");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByRole("heading", { name: "Almost there" });
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(screen.queryByRole("button", { name: "Redo exercise" })).not.toBeInTheDocument();
  });
});
