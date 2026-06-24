import type { Theme } from '../types/dashboard';

const THEME_STORAGE_KEY = 'theme';

export function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore unavailable storage; the in-memory theme still updates.
  }
}

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
