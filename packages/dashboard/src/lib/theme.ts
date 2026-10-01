import type { Theme } from '../types/dashboard';

export const THEME_STORAGE_KEY = 'devframes-color-scheme';

export function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;

  try {
    const legacyTheme = window.localStorage.getItem('theme');
    if (legacyTheme === 'light' || legacyTheme === 'dark') {
      writeStoredTheme(legacyTheme);
      window.localStorage.removeItem('theme');
      return legacyTheme;
    }
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(theme: Theme) {
  try {
    const oldValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (oldValue === theme) return;

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    // Native storage events only reach other windows; notify the embedded Devframe UI too.
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: THEME_STORAGE_KEY,
        oldValue,
        newValue: theme,
        storageArea: window.localStorage,
      }),
    );
  } catch {
    // Ignore unavailable storage; the in-memory theme still updates.
  }
}

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
