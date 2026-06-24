import { PackageSearch } from 'lucide-react';

import { BuildMessages, BuildStatusIcon } from '../../../components/dashboard/build-state';
import { BundlerTargetBadges } from '../../../components/dashboard/bundler-target-badges';
import { EmptyState } from '../../../components/dashboard/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { shortId } from '../../../lib/builds';
import { formatNullableDuration } from '../../../lib/format';
import type { Build, BundlerInstance, Theme } from '../../../types/dashboard';
import { BundlerDetailsSheet } from './bundler-details-sheet';

export function BundlerTable({
  theme,
  bundlers,
  builds,
  triggeringBuildIds,
  selectedBundler,
  selectedBuild,
  onTriggerFullBuild,
  onSelect,
  onDetailsOpenChange,
  onOpenLogs,
}: {
  theme: Theme;
  bundlers: BundlerInstance[];
  builds: Build[];
  triggeringBuildIds: ReadonlySet<string>;
  selectedBundler: BundlerInstance | null;
  selectedBuild: Build | null;
  onTriggerFullBuild: (bundlerId: string) => Promise<void>;
  onSelect: (bundler: BundlerInstance) => void;
  onDetailsOpenChange: (open: boolean) => void;
  onOpenLogs: (build: Build) => void;
}) {
  return (
    <Card className="h-[600px] gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Instances ({bundlers.length})</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-0 [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0">
        {bundlers.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={PackageSearch} title="No instances yet" />
          </div>
        ) : (
          <Table containerClassName="h-full">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">ID</TableHead>
                <TableHead className="min-w-[120px]">Status</TableHead>
                <TableHead className="min-w-[160px]">Target</TableHead>
                <TableHead className="min-w-[120px]">Messages</TableHead>
                <TableHead className="min-w-[120px]">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundlers.map((bundler) => {
                const build = builds.find((item) => item.bundlerId === bundler.id);

                return (
                  <TableRow
                    key={bundler.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(bundler)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(bundler);
                      }
                    }}
                    className="cursor-pointer hover:bg-transparent"
                  >
                    <TableCell className="font-mono">{shortId(bundler.id)}</TableCell>
                    <TableCell>
                      {build == null ? <EmptyCell /> : <BuildStatusIcon status={build.status} />}
                    </TableCell>
                    <TableCell>
                      <BundlerTargetBadges platform={bundler.platform} dev={bundler.dev} />
                    </TableCell>
                    <TableCell>
                      {build == null ? <EmptyCell /> : <BuildMessages build={build} />}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {build == null ? <EmptyCell /> : formatNullableDuration(build.durationMs)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <BundlerDetailsSheet
          open={selectedBundler != null}
          onOpenChange={onDetailsOpenChange}
          theme={theme}
          bundler={selectedBundler}
          build={selectedBuild}
          triggeringBuild={
            selectedBundler == null ? false : triggeringBuildIds.has(selectedBundler.id)
          }
          onTriggerFullBuild={onTriggerFullBuild}
          onOpenLogs={onOpenLogs}
        />
      </CardContent>
    </Card>
  );
}

function EmptyCell() {
  return <span className="text-muted-foreground text-sm">-</span>;
}
