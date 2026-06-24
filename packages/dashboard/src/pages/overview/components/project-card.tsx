import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import type { DashboardConfig, ProjectInfo, Theme } from '../../../types/dashboard';
import { ConfigViewer } from './config-viewer';

export function ProjectCard({
  project,
  theme,
  onLoadConfig,
}: {
  project: ProjectInfo;
  theme: Theme;
  onLoadConfig: () => Promise<DashboardConfig>;
}) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Project</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <ProjectMeta label="Bundler version" value={project.bundlerVersion} />
          <ConfigMeta project={project} theme={theme} onLoadConfig={onLoadConfig} />
        </dl>
      </CardContent>
    </Card>
  );
}

function ConfigMeta({
  project,
  theme,
  onLoadConfig,
}: {
  project: ProjectInfo;
  theme: Theme;
  onLoadConfig: () => Promise<DashboardConfig>;
}) {
  const configPath = project.configPath ?? 'Config path unavailable';

  return (
    <div className="sm:col-span-2">
      <dt className="text-muted-foreground text-sm">Config path</dt>
      <dd className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 break-all font-medium text-sm">{configPath}</span>
        <ConfigViewer
          configPath={project.configPath}
          theme={theme}
          triggerLabel="Details"
          triggerSize="xs"
          onLoadConfig={onLoadConfig}
        />
      </dd>
    </div>
  );
}

function ProjectMeta({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-1 break-all font-medium text-sm">{value}</dd>
    </div>
  );
}
