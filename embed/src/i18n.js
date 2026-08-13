import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { defaultNS, resources } from "./locales/resources.js";

export function initI18n(settings) {
  const language = settings?.language || "en";

  i18next
    .use(initReactI18next)
    .use(LanguageDetector)
    .init({
      fallbackLng: "en",
      lng: language,
      debug: import.meta.env.DEV,
      defaultNS,
      resources,
      load: "languageOnly",
      lowerCaseLng: true,
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "allm_embed_language",
      },
      interpolation: {
        escapeValue: false,
      },
    });

  return i18next;
}

export default i18next;
