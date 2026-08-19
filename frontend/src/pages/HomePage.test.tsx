import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "../test/renderWithStore";
import HomePage from "./HomePage";
import * as weeklyArticleApi from "../utils/knowledgeBase/weeklyArticleApi";

vi.mock("../utils/knowledgeBase/weeklyArticleApi", () => ({
  fetchWeeklyArticle: vi.fn(),
}));

const fetchWeeklyArticle = vi.mocked(weeklyArticleApi.fetchWeeklyArticle);

const characters = [
  {
    char: "爱",
    pinyin: "ai4",
    writing_known: true,
    updated_at: "2026-07-12T12:00:00+00:00",
  },
  {
    char: "好",
    pinyin: "hao3",
    writing_known: false,
    updated_at: "2026-07-12T12:00:00+00:00",
  },
];

const hskLevelStatus = {
  current_level: null,
  next_level: 1,
  characters_to_next_level: 1,
  progress_to_next_level: (2 / 3) * 100,
  missing_characters: ["八"],
  max_level: 7,
  completion_ratio: 0.85,
};

const syncedState = {
  characters: { items: characters },
  hsk: { status: hskLevelStatus },
  sync: {
    status: "succeeded" as const,
    error: null,
    lastSyncedAt: "2026-07-31T00:00:00.000Z",
  },
};

describe("HomePage", () => {
  beforeEach(() => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 1,
      year: 2026,
      hsk_level: 1,
      content: null,
    });
  });

  it("renders character metrics and HSK level from the store", () => {
    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("Your HSK journey starts here")).toBeInTheDocument();
    expect(screen.getByText("1 character to reach HSK 1")).toBeInTheDocument();
    expect(screen.getByLabelText("HSK level")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How HSK level is estimated" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Characters you are able to recognize")).toBeInTheDocument();
    expect(screen.getByText("Characters you can write")).toBeInTheDocument();
  });

  it("explains how the HSK level is estimated", async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, { preloadedState: syncedState });

    await user.click(
      screen.getByRole("button", { name: "How HSK level is estimated" }),
    );

    expect(
      screen.getByRole("heading", { name: "How HSK level is estimated" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /know at least 85% of all characters expected up to that level/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/missing-characters list includes gaps from earlier levels/i),
    ).toBeInTheDocument();
  });

  it("opens the missing characters list from the banner", async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, { preloadedState: syncedState });

    await user.click(screen.getByRole("button", { name: "Missing characters" }));

    expect(
      screen.getByRole("heading", { name: "Missing characters for HSK 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("八")).toBeInTheDocument();
  });

  it("shows an error when progress fails to load", async () => {
    renderWithStore(<HomePage />, {
      preloadedState: {
        sync: {
          status: "failed",
          error: "Failed to load characters.",
          lastSyncedAt: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });
  });

  it("shows the onboarding banner and opens the init wizard when few words are known", async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, {
      preloadedState: {
        ...syncedState,
        words: {
          items: [
            {
              word: "爱好",
              definition: "hobby",
              updated_at: "2026-07-12T12:00:00+00:00",
              characters: ["爱", "好"],
            },
          ],
        },
      },
    });

    await user.click(
      screen.getByRole("button", { name: "Start building your knowledge base" }),
    );

    expect(
      screen.getByRole("heading", { name: "Build your knowledge base" }),
    ).toBeInTheDocument();
  });

  it("hides the onboarding banner once enough words are known", () => {
    const words = Array.from({ length: 10 }, (_, index) => ({
      word: `word-${index}`,
      definition: null,
      updated_at: "2026-07-12T12:00:00+00:00",
      characters: [] as string[],
    }));

    renderWithStore(<HomePage />, {
      preloadedState: { ...syncedState, words: { items: words } },
    });

    expect(
      screen.queryByRole("button", { name: "Start building your knowledge base" }),
    ).not.toBeInTheDocument();
  });

  it("shows each article with its title, content, and pinyin, but not the translation", async () => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 33,
      year: 2026,
      hsk_level: 2,
      content: [
        {
          title: "第一篇",
          content: "你好，这是本周的文章。",
          translation: "Hello, this is this week's article.",
          pinyin: "nǐ hǎo, zhè shì běn zhōu de wénzhāng.",
        },
        {
          title: "第二篇",
          content: "第二篇文章的内容。",
          translation: "The content of the second article.",
          pinyin: "dì èr piān wénzhāng de nèiróng.",
        },
      ],
    });

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(await screen.findByText("第一篇")).toBeInTheDocument();
    expect(screen.getByText("你好，这是本周的文章。")).toBeInTheDocument();
    expect(
      screen.getByText("nǐ hǎo, zhè shì běn zhōu de wénzhāng."),
    ).toBeInTheDocument();
    expect(screen.getByText("第二篇")).toBeInTheDocument();
    expect(screen.getByText("第二篇文章的内容。")).toBeInTheDocument();

    expect(
      screen.queryByText("Hello, this is this week's article."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("The content of the second article."),
    ).not.toBeInTheDocument();
  });

  it("shows the article's category", async () => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 33,
      year: 2026,
      hsk_level: 3,
      content: [
        {
          title: "第一篇",
          content: "第一篇文章的内容。",
          category: ["sports", "world"],
        },
      ],
    });

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(await screen.findByText("sports")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });

  it("does not show a category list when an article has none", async () => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 33,
      year: 2026,
      hsk_level: 3,
      content: [{ title: "第一篇", content: "第一篇文章的内容。" }],
    });

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(await screen.findByText("第一篇")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Article categories"),
    ).not.toBeInTheDocument();
  });

  it("does not show a pinyin line when an article has none", async () => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 33,
      year: 2026,
      hsk_level: 5,
      content: [{ title: "第一篇", content: "第一篇文章的内容。" }],
    });

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(await screen.findByText("第一篇")).toBeInTheDocument();
    expect(screen.getByText("第一篇文章的内容。")).toBeInTheDocument();
  });

  it("shows new words at the end of an article", async () => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 33,
      year: 2026,
      hsk_level: 2,
      content: [
        {
          title: "第一篇",
          content: "长城很长。",
          new_words: [{ word: "长城", translation: "Great Wall" }],
        },
      ],
    });

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(await screen.findByText("New words")).toBeInTheDocument();
    expect(screen.getByText("长城")).toBeInTheDocument();
    expect(screen.getByText("Great Wall")).toBeInTheDocument();
  });

  it("does not show a new words section when an article has none", async () => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 33,
      year: 2026,
      hsk_level: 5,
      content: [{ title: "第一篇", content: "第一篇文章的内容。" }],
    });

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(await screen.findByText("第一篇")).toBeInTheDocument();
    expect(screen.queryByText("New words")).not.toBeInTheDocument();
  });

  it("shows a placeholder when no article was generated yet", async () => {
    fetchWeeklyArticle.mockResolvedValue({
      week: 33,
      year: 2026,
      hsk_level: 2,
      content: null,
    });

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(
      await screen.findByText("No articles for this week yet — check back soon."),
    ).toBeInTheDocument();
  });

  it("shows an error when loading the weekly article fails", async () => {
    fetchWeeklyArticle.mockRejectedValue(
      new Error("Failed to load your weekly articles."),
    );

    renderWithStore(<HomePage />, { preloadedState: syncedState });

    expect(
      await screen.findByText("Failed to load your weekly articles."),
    ).toBeInTheDocument();
  });
});
