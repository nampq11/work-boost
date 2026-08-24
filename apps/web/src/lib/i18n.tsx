import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { type MessageKey, en } from './locales/en.ts';

export type Locale = 'en' | 'vi';

type Params = Record<string, string | number>;

export type Translate = (key: MessageKey, params?: Params) => string;

// Catalog map. `en` is always present; additional locales are added lazily.
const catalogs: Partial<Record<Locale, Record<string, string>>> = {
  en,
};

// Module-level locale mirror so non-React code (stores, handlers) can call `t`
// without a hook. The provider keeps this in sync.
let activeLocale: Locale = 'en';

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    params[key] !== undefined ? String(params[key]) : match,
  );
}

function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const template = catalogs[locale]?.[key] ?? en[key] ?? key;
  return interpolate(template, params);
}

// Module-level `t` for non-React consumers; reflects the active locale.
export function t(key: MessageKey, params?: Params): string {
  return translate(activeLocale, key, params);
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  defaultLocale = 'en',
  children,
}: {
  defaultLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);

  // Keep the module-level locale mirror in sync for non-React callers.
  useEffect(() => {
    setActiveLocale(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey, params?: Params) => translate(locale, key, params),
    }),
    [locale],
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
