import { BundlerCombobox } from '../../components/dashboard/bundler-combobox';
import { PageHeading } from '../../components/layout/page-heading';
import { useBundlerRouteSelection } from '../../lib/bundler-selection';
import type { BundlerInstance, Theme } from '../../types/dashboard';
import { BundlePanel } from './components/bundle-panel';

export function BundlesPage({ bundlers, theme }: { bundlers: BundlerInstance[]; theme: Theme }) {
  const { selectedBundlerId, selectBundler } = useBundlerRouteSelection({
    routePath: '/bundles',
    bundlers,
  });
  const selectedBundler =
    selectedBundlerId == null
      ? null
      : (bundlers.find((bundler) => bundler.id === selectedBundlerId) ?? null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Bundles" />
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
      <BundlePanel bundler={selectedBundler} theme={theme} />
    </div>
  );
}
