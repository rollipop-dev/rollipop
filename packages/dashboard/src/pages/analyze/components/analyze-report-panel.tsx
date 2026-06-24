import { BarChart3, FileQuestion, LoaderCircle } from 'lucide-react';

import { EmptyState } from '../../../components/dashboard/empty-state';
import { Card, CardContent } from '../../../components/ui/card';
import { shortId } from '../../../lib/builds';
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
  if (
    analyzeEnabled &&
    bundler != null &&
    reportAvailable &&
    reportUrl != null &&
    !loading &&
    errorMessage == null
  ) {
    return (
      <iframe
        title={`Analyze report for ${shortId(bundler.id)}`}
        src={reportUrl}
        className="h-[760px] w-full rounded-lg border bg-background"
      />
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
