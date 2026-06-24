import { cn } from '@/lib/utils';
import * as React from 'react';

function ButtonGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="button-group"
      role="group"
      className={cn('inline-flex min-w-0 items-center', className)}
      {...props}
    />
  );
}

export { ButtonGroup };
