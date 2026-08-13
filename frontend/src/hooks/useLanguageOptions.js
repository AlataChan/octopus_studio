import i18n from "@/i18n";

export function useLanguageOptions() {
  // 只支持中文和英文
  const supportedLanguages = ["zh", "en"];
  const languageNames = new Intl.DisplayNames(supportedLanguages, {
    type: "language",
  });
  const changeLanguage = (newLang = "en") => {
    if (!supportedLanguages.includes(newLang)) return false;
    i18n.changeLanguage(newLang);
  };

  return {
    currentLanguage: i18n.language || "zh",
    supportedLanguages,
    getLanguageName: (lang = "en") => languageNames.of(lang),
    changeLanguage,
  };
}
