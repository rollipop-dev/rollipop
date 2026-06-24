import { CheckCircle2, ScrollText, Trash2 } from 'lucide-react';

import {
  BuildMessages,
  BuildStatusBadge,
  LogLevelBadge,
} from '../../../components/dashboard/build-state';
import { EmptyState } from '../../../components/dashboard/empty-state';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { shortId } from '../../../lib/builds';
import { formatDateTime, formatNullableDuration } from '../../../lib/format';
import type { Build, BuildLog, Icon, LogLevel } from '../../../types/dashboard';

export function BuildLogsPanel({
  selectedBundlerId,
  selectedBuild,
  logs,
  loading,
  deleting,
  errorMessage,
  selectedLevels,
  onDeleteLogs,
}: {
  selectedBundlerId: string | null;
  selectedBuild: Build | null;
  logs: BuildLog[];
  loading: boolean;
  deleting: boolean;
  errorMessage: string | null;
  selectedLevels: LogLevel[];
  onDeleteLogs: () => void;
}) {
  const filteredLogs = logs.filter((log) => selectedLevels.includes(log.level));
  const isEmpty =
    selectedBundlerId == null ||
    loading ||
    errorMessage != null ||
    logs.length === 0 ||
    filteredLogs.length === 0;

  return (
    <Card className="h-[600px] gap-0 py-0">
      <CardContent className="flex min-h-0 flex-1 flex-col px-4 py-0">
        <div className="flex h-full min-h-0 flex-col">
          {selectedBundlerId != null && (
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm">
                    {shortId(selectedBundlerId)}
                    <span className="ml-1 text-muted-foreground">({logs.length})</span>
                  </p>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  {selectedBuild == null
                    ? 'No build collected'
                    : `Duration ${formatNullableDuration(selectedBuild.durationMs)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedBuild != null && (
                  <>
                    <BuildStatusBadge status={selectedBuild.status} />
                    <BuildMessages build={selectedBuild} />
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-1"
                  disabled={loading || deleting || logs.length === 0}
                  onClick={onDeleteLogs}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete Logs
                </Button>
              </div>
            </div>
          )}

          <Table className="h-full" containerClassName="min-h-0 flex-1">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[88px]">Level</TableHead>
                <TableHead className="w-[120px]">Source</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-[160px]">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={isEmpty ? 'h-full' : undefined}>
              {selectedBundlerId == null ? (
                <EmptyLogRow icon={ScrollText} title="Select a bundler" />
              ) : loading ? (
                <EmptyLogRow icon={ScrollText} title="Loading logs" />
              ) : errorMessage != null ? (
                <EmptyLogRow
                  icon={ScrollText}
                  title="Unable to load logs"
                  description={errorMessage}
                />
              ) : logs.length === 0 ? (
                <EmptyLogRow icon={CheckCircle2} title="No build logs" />
              ) : filteredLogs.length === 0 ? (
                <EmptyLogRow icon={ScrollText} title="No matching logs" />
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <LogLevelBadge level={log.level} />
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {log.source}
                    </TableCell>
                    <TableCell>{log.message}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(log.timestamp)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyLogRow({
  icon,
  title,
  description,
}: {
  icon: Icon;
  title: string;
  description?: string;
}) {
  return (
    <TableRow className="h-[480px] hover:bg-transparent">
      <TableCell colSpan={4} className="h-full py-0 align-middle">
        <div className="flex h-full items-center justify-center">
          <EmptyState icon={icon} title={title} description={description} />
        </div>
      </TableCell>
    </TableRow>
  );
}
