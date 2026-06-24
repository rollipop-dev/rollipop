import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router';

import { cn } from '../../lib/utils';
import type { Theme } from '../../types/dashboard';
import { Button } from '../ui/button';
import { ThemeSwitch } from './theme-switch';

const REFRESH_ANIMATION_MS = 700;
const DASHBOARD_ASSET_BASE_URL = import.meta.env.BASE_URL;

export function Header({
  theme,
  lastUpdatedAt,
  onToggleTheme,
  onReloadData,
}: {
  theme: Theme;
  lastUpdatedAt: Date | null;
  onToggleTheme: () => void;
  onReloadData: () => void;
}) {
  const [refreshAnimating, setRefreshAnimating] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const reloadData = () => {
    if (refreshAnimating) return;

    setRefreshAnimating(true);
    onReloadData();

    refreshTimerRef.current = window.setTimeout(() => {
      setRefreshAnimating(false);
      refreshTimerRef.current = null;
    }, REFRESH_ANIMATION_MS);
  };

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
          {lastUpdatedAt == null ? null : (
            <p className="hidden text-fd-muted-foreground text-xs sm:block">
              Updated {formatUpdatedAt(lastUpdatedAt)}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Reload dashboard data"
            title="Reload dashboard data"
            aria-disabled={refreshAnimating}
            onClick={reloadData}
          >
            <RefreshCw
              className={cn('size-4', refreshAnimating && 'animate-[spin_700ms_linear_1]')}
              aria-hidden="true"
            />
          </Button>
          <ThemeSwitch theme={theme} onToggleTheme={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}

function formatUpdatedAt(value: Date) {
  return value.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
