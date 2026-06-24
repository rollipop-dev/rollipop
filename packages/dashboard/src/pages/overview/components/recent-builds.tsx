import { BuildMessages, BuildStatusIcon } from '../../../components/dashboard/build-state';
import { BundlerTargetBadges } from '../../../components/dashboard/bundler-target-badges';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { shortId } from '../../../lib/builds';
import { formatNullableDuration } from '../../../lib/format';
import type { Build, BundlerInstance } from '../../../types/dashboard';

export function RecentBuilds({
  bundlers,
  builds,
}: {
  bundlers: BundlerInstance[];
  builds: Build[];
}) {
  const recentBuild = builds[0] ?? null;
  const recentBundler =
    recentBuild == null ? null : bundlers.find((bundler) => bundler.id === recentBuild.bundlerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Build Summary</CardTitle>
      </CardHeader>
      <CardContent>
        {recentBuild == null ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No builds collected.</div>
        ) : (
          <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryField label="Bundler ID" value={shortId(recentBuild.bundlerId)} mono />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Status</p>
              <div className="mt-1">
                <BuildStatusIcon status={recentBuild.status} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Target</p>
              <div className="mt-1">
                <BundlerTargetBadges platform={recentBundler?.platform} dev={recentBundler?.dev} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Messages</p>
              <div className="mt-1">
                <BuildMessages build={recentBuild} />
              </div>
            </div>
            <SummaryField label="Duration" value={formatNullableDuration(recentBuild.durationMs)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`mt-1 font-medium text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
