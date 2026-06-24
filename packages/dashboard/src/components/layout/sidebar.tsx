import { NavLink } from 'react-router';

import { routes } from '../../routes';
import { ScrollArea } from '../ui/scroll-area';

export function Sidebar() {
  return (
    <aside className="md:sticky md:top-20 md:h-[calc(100dvh-6.5rem)]">
      <ScrollArea className="w-full">
        <nav className="flex gap-2 md:flex-col">
          {routes.map((route) => (
            <NavLink
              key={route.path}
              to={route.path}
              end={route.path === '/'}
              className={({ isActive }) =>
                [
                  'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring',
                  isActive
                    ? 'bg-fd-secondary text-fd-secondary-foreground'
                    : 'text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground',
                ].join(' ')
              }
            >
              <route.icon className="h-4 w-4" aria-hidden="true" />
              <span>{route.label}</span>
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
