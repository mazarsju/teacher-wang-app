export type WritingTopic = {
  id: string;
  title: string;
  // The grammar_points.id this topic should be listed right after.
  after_grammar_point: string;
};
