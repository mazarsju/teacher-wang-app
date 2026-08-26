// One .md file per writing topic (frontend/src/data/writingContext/<id>.md),
// giving the learner context on what to write and which grammar to use.
const CONTEXT_FILES = import.meta.glob("./*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function getWritingContext(topicId: string): string | undefined {
  return CONTEXT_FILES[`./${topicId}.md`];
}
