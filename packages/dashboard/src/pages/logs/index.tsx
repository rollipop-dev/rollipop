import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { BundlerCombobox } from '../../components/dashboard/bundler-combobox';
import { PageHeading } from '../../components/layout/page-heading';
import { getBuildLogs } from '../../lib/api';
import { useBundlerRouteSelection } from '../../lib/bundler-selection';
import { queryKeys } from '../../lib/query';
import type { Build, BundlerInstance, LogLevel } from '../../types/dashboard';
import { BuildLogsPanel } from './components/build-logs-panel';
import { LogLevelFilter } from './components/log-level-filter';

const initialSelectedLevels: LogLevel[] = ['info', 'warn', 'error'];

export function LogsPage({
  bundlers,
  builds,
  onDeleteBuildLogs,
}: {
  bundlers: BundlerInstance[];
  builds: Build[];
  onDeleteBuildLogs: (bundlerId: string) => Promise<void>;
}) {
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(initialSelectedLevels);
  const [deletingLogs, setDeletingLogs] = useState(false);
  const { selectedBundlerId, selectBundler } = useBundlerRouteSelection({
    routePath: '/logs',
    bundlers,
  });
  const selectedBundler =
    selectedBundlerId == null
      ? null
      : (bundlers.find((bundler) => bundler.id === selectedBundlerId) ?? null);
  const selectedBuild =
    selectedBundlerId == null
      ? null
      : (builds.find((build) => build.bundlerId === selectedBundlerId) ?? null);
  const logsQuery = useQuery({
    queryKey: queryKeys.buildLogs(selectedBundlerId ?? ''),
    queryFn: () => getBuildLogs(selectedBundlerId!),
    enabled: selectedBundlerId != null,
  });
  const logs = logsQuery.data ?? [];
  const logErrorMessage = logsQuery.error instanceof Error ? logsQuery.error.message : null;

  const deleteSelectedLogs = async () => {
    if (selectedBundlerId == null) return;

    setDeletingLogs(true);
    try {
      await onDeleteBuildLogs(selectedBundlerId);
      toast.success('Build logs deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete build logs');
    } finally {
      setDeletingLogs(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Build Logs" />
      <div className="flex flex-wrap items-center gap-2">
        <BundlerCombobox
          bundlers={bundlers}
          selectedBundlerId={selectedBundler?.id ?? selectedBundlerId}
          onSelect={selectBundler}
        />
        <LogLevelFilter selectedLevels={selectedLevels} onChange={setSelectedLevels} />
      </div>
      <BuildLogsPanel
        selectedBundlerId={selectedBundler?.id ?? selectedBundlerId}
        selectedBuild={selectedBuild}
        logs={logs}
        loading={logsQuery.isPending}
        deleting={deletingLogs}
        errorMessage={logErrorMessage}
        selectedLevels={selectedLevels}
        onDeleteLogs={deleteSelectedLogs}
      />
    </div>
  );
}
