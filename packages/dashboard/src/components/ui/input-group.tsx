import { cn } from '@/lib/utils';
import * as React from 'react';

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'group/input-group relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      className={cn(
        'flex h-auto cursor-text items-center justify-center gap-2 py-1.5 pl-2 text-muted-foreground text-sm select-none [&>svg:not([class*=size-])]:size-4',
        className,
      )}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) {
          return;
        }

        event.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon };
