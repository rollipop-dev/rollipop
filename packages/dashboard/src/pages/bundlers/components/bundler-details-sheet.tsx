import { ChartPie, Copy, LoaderCircle, Play, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { BuildMessages, BuildStatusIcon } from '../../../components/dashboard/build-state';
import { BundlerTargetBadges } from '../../../components/dashboard/bundler-target-badges';
import { CodeBlock } from '../../../components/dashboard/code-block';
import { DownloadFileButton } from '../../../components/dashboard/download-file-button';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { shortId } from '../../../lib/builds';
import { formatNullableDuration } from '../../../lib/format';
import type { Build, BundlerInstance, Theme } from '../../../types/dashboard';

export function BundlerDetailsSheet({
  open,
  onOpenChange,
  bundler,
  build,
  triggeringBuild,
  theme,
  onTriggerFullBuild,
  onOpenLogs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundler: BundlerInstance | null;
  build: Build | null;
  triggeringBuild: boolean;
  theme: Theme;
  onTriggerFullBuild: (bundlerId: string) => Promise<void>;
  onOpenLogs: (build: Build) => void;
}) {
  const navigate = useNavigate();

  if (bundler == null) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const code = JSON.stringify(
    bundler.buildOptions ?? {
      dev: null,
      platform: 'unknown',
      minify: null,
    },
    null,
    2,
  );
  const buildInProgress = triggeringBuild;
  const triggerBuild = async () => {
    if (buildInProgress) return;

    try {
      await onTriggerFullBuild(bundler.id);
      toast.success('Build triggered');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to trigger build');
    }
  };
  const copyBundleUrl = async () => {
    try {
      await navigator.clipboard.writeText(bundler.bundleUrl);
      toast.success('Bundle URL copied');
    } catch {
      toast.error('Failed to copy bundle URL');
    }
  };
  const openAnalyze = () => {
    void navigate(`/analyze?bundlerId=${encodeURIComponent(bundler.id)}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 data-[side=right]:h-dvh data-[side=right]:w-[calc(100vw-2rem)] data-[side=right]:sm:max-w-3xl data-[side=right]:lg:max-w-5xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Instance {shortId(bundler.id)}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 border-b px-5 py-4">
          <div>
            <p className="text-muted-foreground text-xs">Target</p>
            <div className="mt-1">
              <BundlerTargetBadges platform={bundler?.platform} dev={bundler?.dev} />
            </div>
          </div>

          <div>
            <p className="text-muted-foreground text-xs">Bundle URL</p>
            <div className="mt-1 flex min-w-0 items-center rounded-lg border bg-muted/40">
              <p className="min-w-0 flex-1 truncate px-2 py-1.5 font-mono text-xs">
                {bundler.bundleUrl}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Copy bundle URL"
                title="Copy bundle URL"
                onClick={() => {
                  void copyBundleUrl();
                }}
                className="mr-1"
              >
                <Copy aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={buildInProgress}
                  onClick={() => {
                    void triggerBuild();
                  }}
                >
                  {buildInProgress ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                  {buildInProgress ? 'Building' : 'Trigger Build'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={openAnalyze}>
                  <ChartPie className="h-4 w-4" aria-hidden="true" />
                  Analyze
                </Button>
              </div>
              <div className="ml-auto flex flex-wrap justify-end gap-2">
                <DownloadFileButton
                  href={bundler.bundleUrl}
                  fileName={`${bundler.id}.bundle`}
                  label="Bundle Download"
                />
                <DownloadFileButton
                  href={bundler.sourceMapUrl}
                  fileName={`${bundler.id}.bundle.map`}
                  label="Source Map Download"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-sm">Recent Build</p>
              {build != null && (
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenLogs(build)}>
                  <ScrollText className="h-4 w-4" aria-hidden="true" />
                  Build Logs
                </Button>
              )}
            </div>
            {build == null ? (
              <p className="mt-2 text-muted-foreground text-sm">No build collected.</p>
            ) : (
              <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-4">
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <div className="mt-1">
                    <BuildStatusIcon status={build.status} />
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Messages</p>
                  <div className="mt-1">
                    <BuildMessages build={build} />
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Duration</p>
                  <p className="mt-1 font-medium text-sm">
                    {formatNullableDuration(build.durationMs)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <CodeBlock code={code} language="json" theme={theme} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
