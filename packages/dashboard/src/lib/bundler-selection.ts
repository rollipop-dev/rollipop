import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

import type { BundlerInstance } from '../types/dashboard';

export function resolveSelectedBundlerId(
  bundlers: BundlerInstance[],
  rawBundlerId: string | null,
): string | null {
  if (rawBundlerId === '') return null;

  if (rawBundlerId != null && bundlers.some((bundler) => bundler.id === rawBundlerId)) {
    return rawBundlerId;
  }

  return null;
}

export function createSelectedBundlerSearchParams(
  current: URLSearchParams,
  bundlerId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set('bundlerId', bundlerId ?? '');

  return next;
}

export function useBundlerRouteSelection({
  routePath,
  bundlers,
}: {
  routePath: string;
  bundlers: BundlerInstance[];
}) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedBundlerId, setSelectedBundlerId] = useState<string | null>(() =>
    resolveSelectedBundlerId(bundlers, searchParams.get('bundlerId')),
  );

  useEffect(() => {
    if (location.pathname !== routePath) return;

    const routeBundlerId = searchParams.get('bundlerId');
    if (routeBundlerId == null) return;

    setSelectedBundlerId(resolveSelectedBundlerId(bundlers, routeBundlerId));
  }, [bundlers, location.pathname, routePath, searchParams]);

  const selectBundler = (bundlerId: string | null) => {
    setSelectedBundlerId(bundlerId);
    setSearchParams(createSelectedBundlerSearchParams(searchParams, bundlerId));
  };

  return {
    selectedBundlerId,
    selectBundler,
  };
}
