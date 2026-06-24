import { useNavigate } from 'react-router';

import { PageHeading } from '../../components/layout/page-heading';
import type {
  Build,
  BundlerInstance,
  ConnectedDevice,
  DashboardConfig,
  ProjectInfo,
  Theme,
} from '../../types/dashboard';
import { BundlerInstances } from './components/bundler-instances';
import { ConnectedDevices } from './components/connected-devices';
import { DevServerCard } from './components/dev-server-card';
import { ProjectCard } from './components/project-card';
import { RecentBuilds } from './components/recent-builds';

export function OverviewPage({
  theme,
  bundlers,
  devices,
  project,
  builds,
  onLoadConfig,
}: {
  theme: Theme;
  bundlers: BundlerInstance[];
  devices: ConnectedDevice[];
  project: ProjectInfo;
  builds: Build[];
  onLoadConfig: () => Promise<DashboardConfig>;
}) {
  const navigate = useNavigate();
  const openBundler = (bundler: BundlerInstance) => {
    const params = new URLSearchParams({ bundlerId: bundler.id });
    void navigate(`/instances?${params.toString()}`);
  };

  const openDevice = (device: ConnectedDevice) => {
    void navigate(`/devices?${new URLSearchParams({ deviceId: device.id }).toString()}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Overview" />

      <section className="grid gap-4 lg:grid-cols-3">
        <ProjectCard project={project} theme={theme} onLoadConfig={onLoadConfig} />
        <DevServerCard server={project.server} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BundlerInstances bundlers={bundlers} onSelect={openBundler} />
        <ConnectedDevices devices={devices} onSelect={openDevice} />
      </section>

      <section>
        <RecentBuilds bundlers={bundlers} builds={builds} />
      </section>
    </div>
  );
}
