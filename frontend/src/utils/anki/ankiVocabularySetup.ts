export const VOCABULARY_MANDATORY_FIELDS = [
  "writting",
  "pinyin",
  "definition",
] as const;

export const VOCABULARY_MODEL_CSS = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.hanzi {
  font-size: 42px;
}
.extra-fields {
  margin-top: 1em;
  font-size: 16px;
  color: #444444;
}
`;

function ankiFieldRef(name: string): string {
  return `{{${name}}}`;
}

function optionalFieldsHtml(optionalFields: string[]): string {
  if (optionalFields.length === 0) {
    return "";
  }
  const lines = optionalFields.map(ankiFieldRef).join("<br>");
  return `<div class="extra-fields">${lines}</div>`;
}

export function buildVocabularyCardTemplates(
  optionalFields: string[],
): Array<{ Name: string; Front: string; Back: string }> {
  const extras = optionalFieldsHtml(optionalFields);
  const writting = ankiFieldRef("writting");
  const pinyin = ankiFieldRef("pinyin");
  const definition = ankiFieldRef("definition");

  return [
    {
      Name: "Writting → Pinyin + Definition",
      Front: `<div class="hanzi">${writting}</div>`,
      Back: `{{FrontSide}}<hr id=answer>${pinyin}<br>${definition}${extras}`,
    },
    {
      Name: "Pinyin → Writting + Definition",
      Front: pinyin,
      Back:
        `{{FrontSide}}<hr id=answer>` +
        `<div class="hanzi">${writting}</div><br>${definition}${extras}`,
    },
    {
      Name: "Definition → Writting + Pinyin",
      Front: definition,
      Back:
        `{{FrontSide}}<hr id=answer>` +
        `<div class="hanzi">${writting}</div><br>${pinyin}${extras}`,
    },
  ];
}

export function normalizeOptionalFields(optionalFields?: string[]): string[] {
  if (optionalFields === undefined) {
    return [];
  }
  if (!Array.isArray(optionalFields)) {
    throw new Error("optional_fields must be an array of strings");
  }

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of optionalFields) {
    if (typeof raw !== "string") {
      throw new Error("optional_fields must be an array of strings");
    }
    const name = raw.trim();
    if (name === "") {
      continue;
    }
    if ((VOCABULARY_MANDATORY_FIELDS as readonly string[]).includes(name)) {
      throw new Error(
        `Optional field "${name}" conflicts with a mandatory field name.`,
      );
    }
    const lowered = name.toLowerCase();
    if (seen.has(lowered)) {
      throw new Error(`Duplicate optional field "${name}".`);
    }
    seen.add(lowered);
    cleaned.push(name);
  }
  return cleaned;
}
