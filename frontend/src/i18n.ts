import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import admin from "./locales/en/admin.json";
import auth from "./locales/en/auth.json";
import chat from "./locales/en/chat.json";
import challenge from "./locales/en/challenge.json";
import common from "./locales/en/common.json";
import grammar from "./locales/en/grammar.json";
import home from "./locales/en/home.json";
import knowledgeBase from "./locales/en/knowledge-base.json";
import preferences from "./locales/en/preferences.json";
import writing from "./locales/en/writing.json";
import adminFr from "./locales/fr/admin.json";
import authFr from "./locales/fr/auth.json";
import chatFr from "./locales/fr/chat.json";
import challengeFr from "./locales/fr/challenge.json";
import commonFr from "./locales/fr/common.json";
import grammarFr from "./locales/fr/grammar.json";
import homeFr from "./locales/fr/home.json";
import knowledgeBaseFr from "./locales/fr/knowledge-base.json";
import preferencesFr from "./locales/fr/preferences.json";
import writingFr from "./locales/fr/writing.json";

export const defaultNS = "common";

// One namespace per feature area (see docs/adr/frontend-localization.md).
// Adding a language later means adding a sibling resources["fr"] block —
// no code changes to components.
export const resources = {
  en: {
    common,
    home,
    chat,
    challenge,
    "knowledge-base": knowledgeBase,
    grammar,
    writing,
    preferences,
    admin,
    auth,
  },
  fr: {
    common: commonFr,
    home: homeFr,
    chat: chatFr,
    challenge: challengeFr,
    "knowledge-base": knowledgeBaseFr,
    grammar: grammarFr,
    writing: writingFr,
    preferences: preferencesFr,
    admin: adminFr,
    auth: authFr,
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
