import { cn } from '@/lib/utils';
import { Smartphone } from 'lucide-react';

import { shortId } from '../../lib/builds';
import type { ConnectedDevice, Icon } from '../../types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { EmptyState } from './empty-state';

export function DeviceListCard({
  title,
  devices,
  onSelect,
  className,
  emptyState,
  showId = false,
}: {
  title: string;
  devices: ConnectedDevice[];
  onSelect: (device: ConnectedDevice) => void;
  className?: string;
  emptyState?: {
    icon?: Icon;
    title: string;
    description?: string;
  };
  showId?: boolean;
}) {
  const EmptyIcon = emptyState?.icon ?? Smartphone;
  const emptyTitle = emptyState?.title ?? 'No devices connected';

  return (
    <Card className={cn('gap-0 pb-0', className)}>
      <CardHeader className="pb-4">
        <CardTitle>
          {title} ({devices.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-0 [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0">
        {devices.length === 0 ? (
          <div className="flex h-full items-center justify-center pb-6">
            <EmptyState icon={EmptyIcon} title={emptyTitle} description={emptyState?.description} />
          </div>
        ) : (
          <Table containerClassName="h-full">
            <TableHeader>
              <TableRow>
                {showId && <TableHead className="w-[140px]">ID</TableHead>}
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((device) => (
                <TableRow
                  key={device.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(device)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(device);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {showId && (
                    <TableCell className="font-mono text-muted-foreground">
                      {shortId(device.id)}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{device.name}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
