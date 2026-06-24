import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { PageHeading } from '../../components/layout/page-heading';
import type { Build, BundlerInstance, Theme } from '../../types/dashboard';
import { BundlerTable } from './components/bundler-table';

export function InstancesPage({
  theme,
  bundlers,
  builds,
  triggeringBuildIds,
  onTriggerFullBuild,
}: {
  theme: Theme;
  bundlers: BundlerInstance[];
  builds: Build[];
  triggeringBuildIds: ReadonlySet<string>;
  onTriggerFullBuild: (bundlerId: string) => Promise<void>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedBundlerId =
    location.pathname === '/instances' ? searchParams.get('bundlerId') : null;
  const selectedBundler =
    selectedBundlerId == null
      ? null
      : (bundlers.find((bundler) => bundler.id === selectedBundlerId) ?? null);
  const selectedBuild =
    selectedBundler == null
      ? null
      : (builds.find((build) => build.bundlerId === selectedBundler.id) ?? null);

  const setRouteState = (bundlerId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('bundlerId', bundlerId);
    setSearchParams(next);
  };

  const closeDetails = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('bundlerId');
    setSearchParams(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Instances" />

      <BundlerTable
        theme={theme}
        bundlers={bundlers}
        builds={builds}
        triggeringBuildIds={triggeringBuildIds}
        selectedBundler={selectedBundler}
        selectedBuild={selectedBuild}
        onTriggerFullBuild={onTriggerFullBuild}
        onSelect={(bundler) => setRouteState(bundler.id)}
        onDetailsOpenChange={(open) => {
          if (!open) {
            closeDetails();
          }
        }}
        onOpenLogs={(build) => navigate(`/logs?bundlerId=${build.bundlerId}`)}
      />
    </div>
  );
}
