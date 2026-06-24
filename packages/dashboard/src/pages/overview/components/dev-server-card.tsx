import { useEffect, useMemo, useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import type { ProjectInfo } from '../../../types/dashboard';

export function DevServerCard({ server }: { server: ProjectInfo['server'] }) {
  const listening = server.status === 'listening';
  const startedAtMs = useMemo(() => Date.parse(server.startedAt), [server.startedAt]);
  const [now, setNow] = useState(() => Date.now());
  const liveUptimeMs =
    listening && Number.isFinite(startedAtMs) ? Math.max(0, now - startedAtMs) : server.uptimeMs;

  useEffect(() => {
    if (!listening || !Number.isFinite(startedAtMs)) {
      return;
    }

    let timer: number | null = null;
    const scheduleNextTick = () => {
      const elapsed = Math.max(0, Date.now() - startedAtMs);
      const remainder = elapsed % 1000;
      const delay = remainder === 0 ? 1000 : 1000 - remainder;

      timer = window.setTimeout(() => {
        setNow(Date.now());
        scheduleNextTick();
      }, delay);
    };

    setNow(Date.now());
    scheduleNextTick();

    return () => {
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [listening, startedAtMs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dev Server</CardTitle>
        <CardAction>
          <Badge
            variant={listening ? 'secondary' : 'destructive'}
            className={
              listening
                ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
                : undefined
            }
          >
            {listening ? 'Listening' : 'Closed'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div>
            <p className="text-muted-foreground text-xs">Endpoint</p>
            <p className="mt-1 break-all font-semibold text-lg">
              {server.host}:{server.port}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Up time</p>
            <p className="mt-1 font-medium text-sm">{formatUptime(liveUptimeMs)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatUptime(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}
