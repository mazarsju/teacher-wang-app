export type SentenceLine = {
  paragraphIndex: number;
  text: string;
};

// ponytail: naive punctuation-based split (Chinese 。！？ and English .!?) —
// false-splits on abbreviations ("Mr.") or decimals ("3.14"). Upgrade to a
// real sentence tokenizer if that starts mattering.
const SENTENCE_BOUNDARY = /(?<=[。！？.!?])\s*/;

/** Split free-form text into sentences, grouped by the line (paragraph) they're on. */
export function splitIntoSentences(text: string): SentenceLine[] {
  const sentences: SentenceLine[] = [];

  text.split(/\n+/).forEach((line, paragraphIndex) => {
    const trimmedLine = line.trim();
    if (trimmedLine === "") return;

    for (const sentence of trimmedLine.split(SENTENCE_BOUNDARY)) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence !== "") {
        sentences.push({ paragraphIndex, text: trimmedSentence });
      }
    }
  });

  return sentences;
}
