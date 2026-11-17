import { useState, useEffect, useCallback } from 'react';
import { ThemePreference } from '../types';

export const THEME_STORAGE_KEY = 'baf_theme_pref';
const THEME_EVENT_NAME = 'baf_theme_changed';

export function getStoredThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'dark';
}

export function resolveIsDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return true;
}

export function applyThemeToDocument(pref: ThemePreference): boolean {
  const isDark = resolveIsDark(pref);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', isDark);
  }
  return isDark;
}

export function setThemePreferenceGlobal(pref: ThemePreference): boolean {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // ignore storage errors
  }
  const isDark = applyThemeToDocument(pref);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_EVENT_NAME, { detail: pref }));
  }
  return isDark;
}

export function useGlobalTheme() {
  const [themePreference, setThemePrefState] = useState<ThemePreference>(() => {
    const initial = getStoredThemePreference();
    applyThemeToDocument(initial);
    return initial;
  });
  const [isDark, setIsDark] = useState<boolean>(() => resolveIsDark(getStoredThemePreference()));

  const setThemePreference = useCallback((next: ThemePreference) => {
    setThemePrefState(next);
    setIsDark(setThemePreferenceGlobal(next));
  }, []);

  useEffect(() => {
    setIsDark(applyThemeToDocument(themePreference));

    const mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const handleSystemChange = () => {
      if (getStoredThemePreference() === 'system') {
        setIsDark(applyThemeToDocument('system'));
      }
    };

    const handleThemeEvent = (e: Event) => {
      const custom = e as CustomEvent<ThemePreference>;
      const next = custom.detail;
      if (next === 'light' || next === 'dark' || next === 'system') {
        setThemePrefState(next);
        setIsDark(applyThemeToDocument(next));
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const next = getStoredThemePreference();
        setThemePrefState(next);
        setIsDark(applyThemeToDocument(next));
      }
    };

    if (mediaQuery && themePreference === 'system') {
      mediaQuery.addEventListener('change', handleSystemChange);
    }
    window.addEventListener(THEME_EVENT_NAME, handleThemeEvent);
    window.addEventListener('storage', handleStorage);

    return () => {
      if (mediaQuery && themePreference === 'system') {
        mediaQuery.removeEventListener('change', handleSystemChange);
      }
      window.removeEventListener(THEME_EVENT_NAME, handleThemeEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, [themePreference]);

  return {
    themePreference,
    isDark,
    setThemePreference,
  };
}
