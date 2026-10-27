import { useState } from 'react';

import { BundlerCombobox } from '../../components/dashboard/bundler-combobox';
import { PageHeading } from '../../components/layout/page-heading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { shortId } from '../../lib/builds';
import { useBundlerRouteSelection } from '../../lib/bundler-selection';
import type { BundlerInstance, Theme } from '../../types/dashboard';
import { BundlePanel } from './components/bundle-panel';
import { HmrChunksPanel } from './components/hmr-chunks-panel';

export function BundlesPage({ bundlers, theme }: { bundlers: BundlerInstance[]; theme: Theme }) {
  const [activeTab, setActiveTab] = useState('bundle');
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <TabsList aria-label="Bundle source">
          <TabsTrigger value="bundle">Bundle</TabsTrigger>
          <TabsTrigger value="hmr">HMR Chunks</TabsTrigger>
        </TabsList>
        <TabsContent value="bundle">
          <BundlePanel
            source={
              selectedBundler == null
                ? null
                : {
                    kind: 'bundle',
                    cacheKey: selectedBundler.id,
                    title: `Bundle (${shortId(selectedBundler.id)})`,
                    filename: `${selectedBundler.id}.bundle`,
                    bundleUrl: selectedBundler.bundleUrl,
                    sourceMapUrl: selectedBundler.sourceMapUrl,
                  }
            }
            theme={theme}
          />
        </TabsContent>
        <TabsContent value="hmr">
          <HmrChunksPanel
            key={selectedBundler?.id ?? 'none'}
            bundlerId={selectedBundler?.id ?? null}
            active={activeTab === 'hmr'}
            theme={theme}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
