import { BarChart3, FileQuestion, LoaderCircle, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EmptyState } from '../../../components/dashboard/empty-state';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { shortId } from '../../../lib/builds';
import { cn } from '../../../lib/utils';
import type { BundlerInstance } from '../../../types/dashboard';

export function AnalyzeReportPanel({
  bundler,
  analyzeEnabled,
  reportUrl,
  reportAvailable,
  featureFlagsLoading,
  featureFlagsErrorMessage,
  loading,
  errorMessage,
}: {
  bundler: BundlerInstance | null;
  analyzeEnabled: boolean;
  reportUrl: string | null;
  reportAvailable: boolean;
  featureFlagsLoading: boolean;
  featureFlagsErrorMessage: string | null;
  loading: boolean;
  errorMessage: string | null;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const reportVisible =
    analyzeEnabled &&
    bundler != null &&
    reportAvailable &&
    reportUrl != null &&
    !loading &&
    errorMessage == null;

  useEffect(() => {
    if (!reportVisible) {
      setFullscreen(false);
    }
  }, [reportVisible]);

  useEffect(() => {
    setFullscreen(false);
  }, [reportUrl]);

  useEffect(() => {
    if (!fullscreen || typeof document === 'undefined') return;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);

  if (reportVisible && bundler != null && reportUrl != null) {
    const Icon = fullscreen ? Minimize2 : Maximize2;
    const label = fullscreen ? 'Exit full screen' : 'View full screen';

    return (
      <div
        className={cn(
          'relative h-[760px] w-full',
          fullscreen && 'fixed inset-0 z-40 h-dvh bg-background',
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={label}
          title={label}
          aria-pressed={fullscreen}
          className="absolute top-3 right-3 z-10 bg-background/90 shadow-sm backdrop-blur"
          onClick={() => setFullscreen((current) => !current)}
        >
          <Icon className="size-4" aria-hidden="true" />
        </Button>
        <iframe
          title={`Analyze report for ${shortId(bundler.id)}`}
          src={reportUrl}
          className={cn(
            'h-full w-full bg-background',
            fullscreen ? 'border-0' : 'rounded-lg border',
          )}
        />
      </div>
    );
  }

  return (
    <Card className="h-[760px] gap-0">
      <CardContent className="min-h-0 flex-1">
        {featureFlagsLoading ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={LoaderCircle} title="Loading analyze settings" />
          </div>
        ) : featureFlagsErrorMessage != null ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={FileQuestion}
              title="Unable to load analyze settings"
              description={featureFlagsErrorMessage}
            />
          </div>
        ) : !analyzeEnabled ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={BarChart3}
              title="Analyze disabled"
              description="Set `analyzer.enabled` to `true` in config and restart the development server."
            />
          </div>
        ) : bundler == null ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={BarChart3} title="Select a bundle" />
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={LoaderCircle} title="Loading analyze report" />
          </div>
        ) : errorMessage != null ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={FileQuestion}
              title="Unable to load analyze report"
              description={errorMessage}
            />
          </div>
        ) : !reportAvailable || reportUrl == null ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={FileQuestion} title="No analyze report" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
