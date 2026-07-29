import {
  createDeck,
  createModel,
  deckNames,
  modelFieldNames,
  modelNames,
} from "./ankiConnect";
import { persistDeckSetup } from "./ankiDbClient";
import { ANKI_REQUIRED_FIELDS } from "../../types/anki";
import type {
  AnkiDeckKind,
  AnkiDeckSetupResult,
  AnkiFieldKey,
} from "../../types/anki";
import {
  VOCABULARY_MANDATORY_FIELDS,
  VOCABULARY_MODEL_CSS,
  buildVocabularyCardTemplates,
  normalizeOptionalFields,
} from "./ankiVocabularySetup";

export async function fetchAnkiDecks(): Promise<string[]> {
  return deckNames();
}

export async function fetchAnkiModels(): Promise<string[]> {
  return modelNames();
}

export async function fetchAnkiModelFields(modelName: string): Promise<string[]> {
  return modelFieldNames(modelName);
}

export async function setupAnkiDeck(options: {
  kind: AnkiDeckKind;
  deckName: string;
  modelName: string;
  fields: Record<AnkiFieldKey, string>;
  create?: boolean;
}): Promise<AnkiDeckSetupResult> {
  const trimmedDeck = options.deckName.trim();
  const trimmedModel = options.modelName.trim();
  if (trimmedDeck === "") {
    throw new Error("deck_name must be a non-empty string");
  }
  if (trimmedModel === "") {
    throw new Error("model_name must be a non-empty string");
  }

  const required = ANKI_REQUIRED_FIELDS[options.kind];
  const cleanedFields: Record<string, string> = {};
  for (const field of required) {
    const value = options.fields[field.key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(
        `fields.${field.key} is required for kind "${options.kind}"`,
      );
    }
    cleanedFields[field.key] = value.trim();
  }

  if (options.create) {
    await createDeck(trimmedDeck);
  } else {
    const existing = await deckNames();
    if (!existing.includes(trimmedDeck)) {
      throw new Error(`Deck "${trimmedDeck}" was not found in Anki.`);
    }
  }

  const models = await modelNames();
  if (!models.includes(trimmedModel)) {
    throw new Error(`Note type "${trimmedModel}" was not found in Anki.`);
  }

  const modelFields = await modelFieldNames(trimmedModel);
  for (const [logicalKey, ankiField] of Object.entries(cleanedFields)) {
    if (!modelFields.includes(ankiField)) {
      throw new Error(
        `Field "${ankiField}" (mapped to ${logicalKey}) ` +
          `was not found on note type "${trimmedModel}".`,
      );
    }
  }

  return persistDeckSetup({
    kind: options.kind,
    deck_name: trimmedDeck,
    model_name: trimmedModel,
    fields: cleanedFields,
  });
}

export async function autoSetupVocabularyDeck(options: {
  deckName: string;
  modelName: string;
  optionalFields?: string[];
}): Promise<AnkiDeckSetupResult> {
  const trimmedDeck = options.deckName.trim();
  const trimmedModel = options.modelName.trim();
  if (trimmedDeck === "") {
    throw new Error("deck_name must be a non-empty string");
  }
  if (trimmedModel === "") {
    throw new Error("model_name must be a non-empty string");
  }

  const extras = normalizeOptionalFields(options.optionalFields);
  const fieldNames = [...VOCABULARY_MANDATORY_FIELDS, ...extras];

  const existingModels = await modelNames();
  if (existingModels.includes(trimmedModel)) {
    throw new Error(`Note type "${trimmedModel}" already exists in Anki.`);
  }

  await createModel({
    modelName: trimmedModel,
    fields: fieldNames,
    cardTemplates: buildVocabularyCardTemplates(extras),
    css: VOCABULARY_MODEL_CSS,
  });
  await createDeck(trimmedDeck);

  return {
    kind: "mandarin_vocabulary",
    deck: {
      status: "not_configured",
      deck_name: trimmedDeck,
      model_name: trimmedModel,
      fields: {
        writting: "writting",
        pinyin: "pinyin",
        definition: "definition",
      },
    },
  };
}
