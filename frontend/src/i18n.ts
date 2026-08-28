import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import admin from "./locales/en/admin.json";
import auth from "./locales/en/auth.json";
import chat from "./locales/en/chat.json";
import common from "./locales/en/common.json";
import grammar from "./locales/en/grammar.json";
import home from "./locales/en/home.json";
import knowledgeBase from "./locales/en/knowledge-base.json";
import preferences from "./locales/en/preferences.json";
import writing from "./locales/en/writing.json";

export const defaultNS = "common";

// One namespace per feature area (see docs/adr/frontend-localization.md).
// Adding a language later means adding a sibling resources["fr"] block —
// no code changes to components.
export const resources = {
  en: {
    common,
    home,
    chat,
    "knowledge-base": knowledgeBase,
    grammar,
    writing,
    preferences,
    admin,
    auth,
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  defaultNS,
  ns: Object.keys(resources.en),
  interpolation: {
    escapeValue: false, // React already escapes output.
  },
  // Resources are bundled statically, so init completes synchronously —
  // components and tests can call t() on first render.
  initAsync: false,
});

export default i18n;
