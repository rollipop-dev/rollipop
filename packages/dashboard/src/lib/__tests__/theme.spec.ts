import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { getSystemTheme, readStoredTheme, THEME_STORAGE_KEY, writeStoredTheme } from '../theme';

describe('dashboard theme', () => {
  const values = new Map<string, string>();
  const dispatchEvent = vi.fn();
  const localStorage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };

  beforeEach(() => {
    values.clear();
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      localStorage,
      dispatchEvent,
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    vi.stubGlobal(
      'StorageEvent',
      class {
        constructor(type: string, init: StorageEventInit) {
          Object.assign(this, { type, ...init });
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['light', 'dark'] as const)("uses Devframe's stored %s theme", (theme) => {
    values.set(THEME_STORAGE_KEY, theme);

    expect(readStoredTheme()).toBe(theme);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('migrates the legacy dashboard preference and notifies the embedded UI once', () => {
    values.set('theme', 'dark');
    values.set(THEME_STORAGE_KEY, 'light');

    expect(readStoredTheme()).toBe('dark');
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(values.has('theme')).toBe(false);
    expect(readStoredTheme()).toBe('dark');
    expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: 'storage', key: THEME_STORAGE_KEY, newValue: 'dark' }),
    );
  });

  it('preserves Devframe auto mode after migrating the legacy preference', () => {
    values.set('theme', 'light');
    expect(readStoredTheme()).toBe('light');
    dispatchEvent.mockClear();
    values.set(THEME_STORAGE_KEY, 'auto');

    expect(readStoredTheme()).toBeNull();
    expect(getSystemTheme()).toBe('dark');
    expect(values.get(THEME_STORAGE_KEY)).toBe('auto');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('notifies same-window listeners when the dashboard changes the shared theme', () => {
    values.set(THEME_STORAGE_KEY, 'light');

    writeStoredTheme('dark');

    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'storage',
        key: THEME_STORAGE_KEY,
        oldValue: 'light',
        newValue: 'dark',
        storageArea: localStorage,
      }),
    );
  });

  it('does not rebroadcast an unchanged theme', () => {
    values.set(THEME_STORAGE_KEY, 'dark');

    writeStoredTheme('dark');

    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('keeps working when storage is unavailable', () => {
    localStorage.getItem.mockImplementationOnce(() => {
      throw new Error('Storage is unavailable');
    });
    expect(readStoredTheme()).toBeNull();

    localStorage.setItem.mockImplementationOnce(() => {
      throw new Error('Storage is unavailable');
    });
    expect(() => writeStoredTheme('dark')).not.toThrow();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
