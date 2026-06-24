import { Badge } from '../ui/badge';
import { PlatformBadge } from './platform-badge';

export function BundlerTargetBadges({
  platform,
  dev,
  align = 'start',
}: {
  platform?: string;
  dev?: boolean;
  align?: 'start' | 'end';
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${align === 'end' ? 'justify-end' : ''}`}>
      <PlatformBadge platform={platform ?? 'unknown'} />
      {dev == null ? (
        <Badge variant="outline">unknown</Badge>
      ) : (
        <Badge
          variant={dev ? 'secondary' : 'destructive'}
          className={
            dev ? undefined : 'bg-red-500/15 text-red-700 hover:bg-red-500/20 dark:text-red-300'
          }
        >
          {dev ? 'dev' : 'prod'}
        </Badge>
      )}
    </div>
  );
}
