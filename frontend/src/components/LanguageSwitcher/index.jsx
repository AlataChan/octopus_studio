import { useState, useRef, useEffect } from "react";
import { Translate } from "@phosphor-icons/react";
import { useLanguageOptions } from "@/hooks/useLanguageOptions";

export default function LanguageSwitcher() {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const {
    currentLanguage,
    supportedLanguages,
    getLanguageName,
    changeLanguage,
  } = useLanguageOptions();

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMenu]);

  const handleLanguageChange = (lang) => {
    changeLanguage(lang);
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowMenu(!showMenu)}
        type="button"
        className="transition-all duration-300 p-2 rounded-full bg-theme-sidebar-footer-icon hover:bg-theme-sidebar-footer-icon-hover flex items-center justify-center"
        aria-label="Change language"
        data-tooltip-id="footer-item"
        data-tooltip-content="切换语言 / Change language"
      >
        <Translate
          className="h-5 w-5"
          weight="fill"
          color="var(--theme-sidebar-footer-icon-fill)"
        />
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          className="fixed bottom-16 left-4 w-48 rounded-lg bg-theme-action-menu-bg shadow-lg border border-theme-border p-2 z-50"
        >
          <div className="flex flex-col gap-y-1 max-h-64 overflow-y-auto">
            {supportedLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => handleLanguageChange(lang)}
                className={`text-left px-3 py-2 rounded-md transition-colors duration-200 ${
                  currentLanguage === lang
                    ? "bg-sky-500/20 text-sky-400"
                    : "text-theme-text-primary hover:bg-theme-action-menu-item-hover"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm">{getLanguageName(lang)}</span>
                  {currentLanguage === lang && (
                    <span className="text-xs">✓</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
