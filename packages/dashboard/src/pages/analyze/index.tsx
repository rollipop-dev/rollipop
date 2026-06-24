import { useQuery } from '@tanstack/react-query';

import { BundlerCombobox } from '../../components/dashboard/bundler-combobox';
import { PageHeading } from '../../components/layout/page-heading';
import { getAnalyzeReportUrl, hasAnalyzeReport } from '../../lib/api';
import { useBundlerRouteSelection } from '../../lib/bundler-selection';
import { queryKeys } from '../../lib/query';
import type { BundlerInstance, FeatureFlags } from '../../types/dashboard';
import { AnalyzeReportPanel } from './components/analyze-report-panel';

export function AnalyzePage({
  bundlers,
  featureFlags,
  featureFlagsLoading,
  featureFlagsErrorMessage,
}: {
  bundlers: BundlerInstance[];
  featureFlags: FeatureFlags | null;
  featureFlagsLoading: boolean;
  featureFlagsErrorMessage: string | null;
}) {
  const { selectedBundlerId, selectBundler } = useBundlerRouteSelection({
    routePath: '/analyze',
    bundlers,
  });
  const selectedBundler =
    selectedBundlerId == null
      ? null
      : (bundlers.find((bundler) => bundler.id === selectedBundlerId) ?? null);
  const selectedReportBundlerId = selectedBundler?.id ?? null;
  const analyzeEnabled = featureFlags?.analyze === true;
  const reportQuery = useQuery({
    queryKey: queryKeys.analyzeReport(selectedReportBundlerId ?? ''),
    queryFn: () => hasAnalyzeReport(selectedReportBundlerId ?? ''),
    enabled: analyzeEnabled && selectedReportBundlerId != null,
  });
  const reportUrl =
    selectedReportBundlerId == null ? null : getAnalyzeReportUrl(selectedReportBundlerId);
  const reportErrorMessage = reportQuery.error instanceof Error ? reportQuery.error.message : null;
  const showBundlerSelect =
    !featureFlagsLoading && featureFlagsErrorMessage == null && analyzeEnabled;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Analyze" />
      {showBundlerSelect ? (
        <div className="flex flex-wrap items-center gap-2">
          <BundlerCombobox
            bundlers={bundlers}
            selectedBundlerId={selectedBundler?.id ?? selectedBundlerId}
            placeholder="Select bundle"
            searchPlaceholder="Search bundle..."
            emptyMessage="No bundle found."
            onSelect={selectBundler}
          />
        </div>
      ) : null}
      <AnalyzeReportPanel
        bundler={selectedBundler}
        analyzeEnabled={analyzeEnabled}
        reportUrl={reportUrl}
        reportAvailable={reportQuery.data === true}
        featureFlagsLoading={featureFlagsLoading}
        featureFlagsErrorMessage={featureFlagsErrorMessage}
        loading={analyzeEnabled && reportQuery.isPending && selectedReportBundlerId != null}
        errorMessage={reportErrorMessage}
      />
    </div>
  );
}
