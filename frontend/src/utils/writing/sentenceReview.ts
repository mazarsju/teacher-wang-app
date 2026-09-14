import type { CoveredGrammarPoint, WritingSentenceCheck } from "../../types/writingSentence";
import { detectGrammarPoints } from "../grammar/grammarPointsApi";
import { checkWritingSentence } from "./writingApi";

// Shared by WritingPracticeDetailPage and ListeningWritingBonus — both run
// the same "submit free text, check topic relevance, then check each
// sentence's grammar" flow; only draft persistence/archiving differs.

export function groupByParagraph(sentences: WritingSentenceCheck[]): WritingSentenceCheck[][] {
  const paragraphs: WritingSentenceCheck[][] = [];
  for (const sentence of sentences) {
    const lastParagraph = paragraphs[paragraphs.length - 1];
    if (lastParagraph && lastParagraph[0]?.paragraphIndex === sentence.paragraphIndex) {
      lastParagraph.push(sentence);
    } else {
      paragraphs.push([sentence]);
    }
  }
  return paragraphs;
}

export function isFlawed(sentence: WritingSentenceCheck): boolean {
  return sentence.status === "done" && sentence.severity !== null && sentence.severity !== "none";
}

export function buildSentenceCorrectionContext(sentence: WritingSentenceCheck): string {
  return `# Writing correction\n\nThe learner wrote: "${sentence.text}"\n\n${sentence.answer}`;
}

export type SentenceCheckResult = Pick<
  WritingSentenceCheck,
  "status" | "severity" | "answer" | "grammarPointsCovered"
>;

export async function runSentenceCheck(text: string): Promise<SentenceCheckResult> {
  try {
    const correction = await checkWritingSentence(text);
    let grammarPointsCovered: CoveredGrammarPoint[] = [];
    if (correction.severity === "none") {
      try {
        grammarPointsCovered = await detectGrammarPoints(text);
      } catch {
        // Grammar-rule detection is a bonus signal; a failure here
        // shouldn't block showing the correctness result.
      }
    }
    return {
      status: "done",
      severity: correction.severity,
      answer: correction.answer ?? null,
      grammarPointsCovered,
    };
  } catch {
    return { status: "error", severity: null, answer: null, grammarPointsCovered: [] };
  }
}

export function isAllCorrect(checks: WritingSentenceCheck[]): boolean {
  return checks.every((sentence) => sentence.severity === "none");
}

export type ReviewSummary = {
  allCorrect: boolean;
  grammarPointTitles: string[];
};

export function buildReviewSummary(
  checks: WritingSentenceCheck[],
  allCorrect: boolean,
): ReviewSummary {
  const covered = checks.flatMap((sentence) => sentence.grammarPointsCovered);
  return {
    allCorrect,
    grammarPointTitles: [...new Set(covered.map((point) => point.title))],
  };
}
