import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate, UI_LOCALES } from "../lib/uiStrings.js";

const UiLocaleContext = createContext(null);

function applyDocumentLocale(locale) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
}

export function UiLocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    if (typeof window === "undefined") {
      return "en";
    }

    const stored = window.localStorage.getItem("incognito-ui-locale");
    return UI_LOCALES.includes(stored) ? stored : "en";
  });

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale) => {
    if (!UI_LOCALES.includes(nextLocale)) {
      return;
    }

    setLocaleState(nextLocale);
    window.localStorage.setItem("incognito-ui-locale", nextLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "fr" ? "en" : "fr");
  }, [locale, setLocale]);

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return <UiLocaleContext.Provider value={value}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale() {
  const context = useContext(UiLocaleContext);
  if (!context) {
    throw new Error("useUiLocale must be used within UiLocaleProvider");
  }
  return context;
}
