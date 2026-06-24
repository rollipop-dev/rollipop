import { cn } from '@/lib/utils';
import { Progress as ProgressPrimitive } from 'radix-ui';
import * as React from 'react';

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const percentage = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={percentage ?? undefined}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full rounded-full bg-primary transition-all',
          percentage == null ? 'w-1/3 animate-pulse' : 'w-full',
        )}
        style={percentage == null ? undefined : { transform: `translateX(-${100 - percentage}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
