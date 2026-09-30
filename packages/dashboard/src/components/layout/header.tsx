import { NavLink } from 'react-router';

import type { Theme } from '../../types/dashboard';
import { ThemeSwitch } from './theme-switch';

const DASHBOARD_ASSET_BASE_URL = import.meta.env.BASE_URL;

export function Header({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 w-full border-fd-border border-b bg-fd-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-1.5 pl-2">
          <NavLink
            to="/"
            className="mr-4 flex min-w-0 items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
          >
            <img
              src={`${DASHBOARD_ASSET_BASE_URL}logo.svg`}
              alt="Rollipop"
              className="h-10 w-10 shrink-0"
            />
            <p className="truncate font-medium text-md">Rollipop</p>
          </NavLink>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <ThemeSwitch theme={theme} onToggleTheme={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
