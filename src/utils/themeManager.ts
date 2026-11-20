import { useState, useEffect, useCallback } from 'react';
import { ThemePreference } from '../types';

export const THEME_STORAGE_KEY = 'baf_theme_pref';
export const THEME_MANUAL_FLAG_KEY = 'baf_theme_pref_manual_v1';
const THEME_EVENT_NAME = 'baf_theme_changed';

function syncKeyToLocalCloudSnapshot(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const rawSnap = localStorage.getItem('baf_local_storage_snapshot');
    const parsed = rawSnap ? JSON.parse(rawSnap) : {};
    if (parsed && typeof parsed === 'object') {
      if (!parsed.app_settings || typeof parsed.app_settings !== 'object') {
        parsed.app_settings = {};
      }
      parsed.app_settings[key] = value;
      localStorage.setItem('baf_local_storage_snapshot', JSON.stringify(parsed));
    }
    const rawFetch = (window as any).__baf_raw_fetch || window.fetch;
    if (typeof rawFetch === 'function') {
      rawFetch('/api/canteen/save-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setting_key: key, setting_value: value }),
      }).catch(() => {});
    }
  } catch {
    // ignore snapshot update errors
  }
}

export function getStoredThemePreference(): ThemePreference {
  try {
    const isManual = localStorage.getItem(THEME_MANUAL_FLAG_KEY) === 'true';
    if (!isManual) {
      return 'system';
    }
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'system';
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
    localStorage.setItem(THEME_MANUAL_FLAG_KEY, 'true');
    syncKeyToLocalCloudSnapshot(THEME_STORAGE_KEY, pref);
    syncKeyToLocalCloudSnapshot(THEME_MANUAL_FLAG_KEY, 'true');
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
