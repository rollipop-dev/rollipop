import { AlertTriangle, CheckCircle2, Clock3, XCircle } from 'lucide-react';

import { getLogCounts } from '../../lib/builds';
import type { Build, BuildStatus, LogLevel } from '../../types/dashboard';
import { Badge } from '../ui/badge';

export function BuildMessages({ build }: { build: Build }) {
  const counts = getLogCounts(build);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <LogCountBadge level="warn" count={counts.warn} />
      <LogCountBadge level="error" count={counts.error} />
    </div>
  );
}

export function BuildStatusBadge({ status }: { status: BuildStatus }) {
  const IconComponent =
    status === 'success' ? CheckCircle2 : status === 'failed' ? XCircle : Clock3;
  const label = status === 'success' ? 'Success' : status === 'failed' ? 'Failed' : 'Pending';
  const variant = status === 'failed' ? 'destructive' : 'secondary';
  const className =
    status === 'success'
      ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
      : '';

  return (
    <Badge variant={variant} className={className}>
      <IconComponent className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function BuildStatusIcon({ status }: { status: BuildStatus }) {
  const IconComponent =
    status === 'success' ? CheckCircle2 : status === 'failed' ? XCircle : Clock3;
  const label = status === 'success' ? 'Success' : status === 'failed' ? 'Failed' : 'Pending';
  const className =
    status === 'success'
      ? 'size-4 text-emerald-600 dark:text-emerald-300'
      : status === 'failed'
        ? 'size-4 text-red-600 dark:text-red-300'
        : 'size-4 text-muted-foreground';

  return <IconComponent role="img" aria-label={label} className={className} />;
}

function LogCountBadge({ level, count }: { level: 'warn' | 'error'; count: number }) {
  const IconComponent = level === 'warn' ? AlertTriangle : XCircle;

  return (
    <Badge
      variant={level === 'warn' ? 'secondary' : 'destructive'}
      className={
        level === 'warn'
          ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'
          : ''
      }
    >
      <IconComponent className="h-3.5 w-3.5" aria-hidden="true" />
      {count}
    </Badge>
  );
}

export function LogLevelBadge({ level }: { level: LogLevel }) {
  const variant = level === 'error' ? 'destructive' : 'secondary';
  const className =
    level === 'warn'
      ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'
      : '';

  return (
    <Badge variant={variant} className={className}>
      {level}
    </Badge>
  );
}
