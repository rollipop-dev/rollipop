import { Moon, Sun } from 'lucide-react';

import type { Theme } from '../../types/dashboard';

export function ThemeSwitch({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={theme === 'dark'}
      aria-label="Toggle theme"
      onClick={onToggleTheme}
      data-theme-toggle=""
      className="inline-flex cursor-pointer items-center rounded-full border p-1 *:rounded-full"
    >
      <Sun
        fill="currentColor"
        className={themeSwitchItemClass(theme === 'light')}
        aria-hidden="true"
      />
      <Moon
        fill="currentColor"
        className={themeSwitchItemClass(theme === 'dark')}
        aria-hidden="true"
      />
    </button>
  );
}

function themeSwitchItemClass(active: boolean) {
  return [
    'size-6.5 p-1.5 text-fd-muted-foreground',
    active ? 'bg-fd-accent text-fd-accent-foreground' : 'text-fd-muted-foreground',
  ].join(' ');
}
