import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, RefreshCw, ServerCrash } from 'lucide-react';
import {
  Activity,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { EmptyState } from './components/dashboard/empty-state';
import { Header } from './components/layout/header';
import { Sidebar } from './components/layout/sidebar';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Toaster } from './components/ui/sonner';
import {
  deleteBuildLogs as requestDeleteBuildLogs,
  getBuilds,
  getBuildLogs,
  getConfig as requestGetConfig,
  getDashboardSnapshot,
  getFeatureFlags,
  reloadDevices as requestReloadDevices,
  resetBundlerState as requestResetBundlerState,
  resetCache as requestResetCache,
  triggerBundlerFullBuild as requestTriggerBundlerFullBuild,
} from './lib/api';
import { queryKeys } from './lib/query';
import { getSystemTheme, readStoredTheme, writeStoredTheme } from './lib/theme';
import { useDashboardEvents } from './lib/use-dashboard-events';
import { ActionsPage } from './pages/actions';
import { AnalyzePage } from './pages/analyze';
import { InstancesPage } from './pages/bundlers';
import { BundlesPage } from './pages/bundles';
import { DevicesPage } from './pages/devices';
import { LogsPage } from './pages/logs';
import { OverviewPage } from './pages/overview';
import type {
  Build,
  DashboardConfig,
  DashboardSnapshot,
  FeatureFlags,
  Theme,
} from './types/dashboard';

type DataStatus = 'loading' | 'ready' | 'error';
type DashboardPagePath =
  | '/'
  | '/instances'
  | '/bundles'
  | '/analyze'
  | '/devices'
  | '/logs'
  | '/actions';

const DASHBOARD_API_ERROR_TOAST_ID = 'dashboard-api-error';
const MIN_TRIGGER_BUILD_BUSY_MS = 1000;
const DASHBOARD_REFRESH_DEBOUNCE_MS = 1000;

interface RefreshDashboardDataOptions {
  notify?: boolean;
  throwOnError?: boolean;
  buildLogsBundlerIds?: string[];
}

export function App() {
  const queryClient = useQueryClient();
  const [hasStoredTheme, setHasStoredTheme] = useState(() => readStoredTheme() !== null);
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? getSystemTheme());
  const [triggeringBuilds, setTriggeringBuilds] = useState<Record<string, number>>({});
  const [devServerConnected, setDevServerConnected] = useState<boolean | null>(null);
  const dashboardApiErrorVisibleRef = useRef(false);
  const buildTriggerTimersRef = useRef<Record<string, number>>({});
  const refreshDebounceTimerRef = useRef<number | null>(null);
  const pendingRefreshBuildLogsRef = useRef<Set<string>>(new Set());
  const pendingRefreshResolversRef = useRef<Array<(refreshed: boolean) => void>>([]);
  const snapshotQuery = useQuery({
    queryKey: queryKeys.snapshot,
    queryFn: getDashboardSnapshot,
  });
  const buildsQuery = useQuery({
    queryKey: queryKeys.builds,
    queryFn: getBuilds,
  });
  const featureFlagsQuery = useQuery({
    queryKey: queryKeys.featureFlags,
    queryFn: getFeatureFlags,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const snapshot = snapshotQuery.data ?? null;
  const builds = buildsQuery.data ?? [];
  const featureFlags = featureFlagsQuery.data ?? null;
  const featureFlagsError = getErrorMessage(featureFlagsQuery.error);
  const dashboardApiErrored =
    snapshotQuery.isError ||
    snapshotQuery.isRefetchError ||
    buildsQuery.isError ||
    buildsQuery.isRefetchError;
  const visibleSnapshot = useMemo(() => {
    if (snapshot == null) return null;

    const serverClosed =
      devServerConnected === false || (devServerConnected == null && dashboardApiErrored);
    if (!serverClosed || snapshot.project.server.status === 'closed') {
      return snapshot;
    }

    return {
      ...snapshot,
      project: {
        ...snapshot.project,
        server: {
          ...snapshot.project.server,
          status: 'closed' as const,
        },
      },
    };
  }, [dashboardApiErrored, devServerConnected, snapshot]);
  const dataStatus: DataStatus =
    snapshotQuery.isPending || buildsQuery.isPending
      ? 'loading'
      : snapshotQuery.isError || buildsQuery.isError
        ? 'error'
        : 'ready';
  const dataError = getErrorMessage(snapshotQuery.error) ?? getErrorMessage(buildsQuery.error);
  const lastUpdatedAt = useMemo(() => {
    const updatedAt = Math.max(snapshotQuery.dataUpdatedAt, buildsQuery.dataUpdatedAt);

    return updatedAt > 0 ? new Date(updatedAt) : null;
  }, [snapshotQuery.dataUpdatedAt, buildsQuery.dataUpdatedAt]);
  const triggeringBuildIds = useMemo(
    () => new Set(Object.keys(triggeringBuilds)),
    [triggeringBuilds],
  );
  const clearDashboardApiError = useCallback(() => {
    if (!dashboardApiErrorVisibleRef.current) return;

    toast.dismiss(DASHBOARD_API_ERROR_TOAST_ID);
    dashboardApiErrorVisibleRef.current = false;
  }, []);
  const showDashboardApiError = useCallback((message: string, { force = false } = {}) => {
    if (!force && dashboardApiErrorVisibleRef.current) return;

    dashboardApiErrorVisibleRef.current = true;
    toast.error(message, {
      id: DASHBOARD_API_ERROR_TOAST_ID,
    });
  }, []);

  const refreshDashboardData = useCallback(
    async ({
      notify = false,
      throwOnError = false,
      buildLogsBundlerIds = [],
    }: RefreshDashboardDataOptions = {}) => {
      try {
        const requests: Promise<unknown>[] = [
          queryClient.fetchQuery({
            queryKey: queryKeys.snapshot,
            queryFn: getDashboardSnapshot,
            staleTime: 0,
          }),
          queryClient.fetchQuery({
            queryKey: queryKeys.builds,
            queryFn: getBuilds,
            staleTime: 0,
          }),
        ];

        for (const buildLogsBundlerId of new Set(buildLogsBundlerIds)) {
          requests.push(
            queryClient.fetchQuery({
              queryKey: queryKeys.buildLogs(buildLogsBundlerId),
              queryFn: () => getBuildLogs(buildLogsBundlerId),
              staleTime: 0,
            }),
          );
        }

        await Promise.all(requests);
        clearDashboardApiError();
        setDevServerConnected(true);

        if (notify) {
          toast.success('Dashboard data refreshed');
        }

        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh dashboard data';
        setDevServerConnected((current) => (current === true ? current : false));
        showDashboardApiError(message, { force: notify });

        if (throwOnError) {
          throw error instanceof Error ? error : new Error(message);
        }

        return false;
      }
    },
    [clearDashboardApiError, queryClient, showDashboardApiError],
  );
  const scheduleDashboardDataRefresh = useCallback(
    ({ buildLogsBundlerId }: { buildLogsBundlerId?: string } = {}) => {
      if (buildLogsBundlerId != null) {
        pendingRefreshBuildLogsRef.current.add(buildLogsBundlerId);
      }

      if (refreshDebounceTimerRef.current != null) {
        window.clearTimeout(refreshDebounceTimerRef.current);
      }

      return new Promise<boolean>((resolve) => {
        pendingRefreshResolversRef.current.push(resolve);
        refreshDebounceTimerRef.current = window.setTimeout(async () => {
          refreshDebounceTimerRef.current = null;

          const buildLogsBundlerIds = Array.from(pendingRefreshBuildLogsRef.current);
          pendingRefreshBuildLogsRef.current.clear();

          const resolvers = pendingRefreshResolversRef.current;
          pendingRefreshResolversRef.current = [];

          const refreshed = await refreshDashboardData({ buildLogsBundlerIds });
          for (const resolveRefresh of resolvers) {
            resolveRefresh(refreshed);
          }
        }, DASHBOARD_REFRESH_DEBOUNCE_MS);
      });
    },
    [refreshDashboardData],
  );

  const clearBuildTriggerTimer = useCallback((bundlerId: string) => {
    const timerId = buildTriggerTimersRef.current[bundlerId];
    if (timerId == null) return;

    window.clearTimeout(timerId);
    delete buildTriggerTimersRef.current[bundlerId];
  }, []);
  const completeBuildTrigger = useCallback(
    (bundlerId: string) => {
      setTriggeringBuilds((current) => {
        const requestedAt = current[bundlerId];
        if (requestedAt == null) return current;

        const remainingMs = MIN_TRIGGER_BUILD_BUSY_MS - (Date.now() - requestedAt);
        if (remainingMs > 0) {
          if (buildTriggerTimersRef.current[bundlerId] == null) {
            buildTriggerTimersRef.current[bundlerId] = window.setTimeout(() => {
              delete buildTriggerTimersRef.current[bundlerId];
              setTriggeringBuilds((latest) => {
                if (latest[bundlerId] !== requestedAt) return latest;

                const { [bundlerId]: _completedBuild, ...next } = latest;
                return next;
              });
            }, remainingMs);
          }

          return current;
        }

        clearBuildTriggerTimer(bundlerId);
        const { [bundlerId]: _completedBuild, ...next } = current;
        return next;
      });
    },
    [clearBuildTriggerTimer],
  );
  const syncCompletedBuild = useCallback(
    async (bundlerId: string) => {
      try {
        await scheduleDashboardDataRefresh({ buildLogsBundlerId: bundlerId });
      } finally {
        completeBuildTrigger(bundlerId);
      }
    },
    [completeBuildTrigger, scheduleDashboardDataRefresh],
  );
  const handleBuildEvent = useCallback(
    (event: { type: string; bundlerId?: string }) => {
      if (event.bundlerId == null) return;

      if (event.type === 'bundle_build_started') {
        void scheduleDashboardDataRefresh({ buildLogsBundlerId: event.bundlerId });
        return;
      }

      if (event.type === 'bundle_build_done' || event.type === 'bundle_build_failed') {
        void syncCompletedBuild(event.bundlerId);
      }
    },
    [scheduleDashboardDataRefresh, syncCompletedBuild],
  );
  const handleDataEvent = useCallback(() => {
    void scheduleDashboardDataRefresh();
  }, [scheduleDashboardDataRefresh]);

  useDashboardEvents({
    onBuildEvent: handleBuildEvent,
    onDataEvent: handleDataEvent,
  });

  useEffect(() => {
    const message = getErrorMessage(snapshotQuery.error) ?? getErrorMessage(buildsQuery.error);
    if (message == null || snapshot == null) return;

    setDevServerConnected((current) => (current === true ? current : false));
    showDashboardApiError(message);
  }, [
    buildsQuery.error,
    buildsQuery.errorUpdatedAt,
    showDashboardApiError,
    snapshot,
    snapshotQuery.error,
    snapshotQuery.errorUpdatedAt,
  ]);

  useEffect(() => {
    for (const [bundlerId, requestedAt] of Object.entries(triggeringBuilds)) {
      const build = builds.find((item) => item.bundlerId === bundlerId);
      const startedAt = build == null ? Number.NaN : Date.parse(build.startedAt);

      if (
        build != null &&
        build.status !== 'pending' &&
        Number.isFinite(startedAt) &&
        startedAt >= requestedAt - 1_000
      ) {
        completeBuildTrigger(bundlerId);
      }
    }
  }, [builds, completeBuildTrigger, triggeringBuilds]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(buildTriggerTimersRef.current)) {
        window.clearTimeout(timerId);
      }

      buildTriggerTimersRef.current = {};

      if (refreshDebounceTimerRef.current != null) {
        window.clearTimeout(refreshDebounceTimerRef.current);
        refreshDebounceTimerRef.current = null;
      }

      for (const resolveRefresh of pendingRefreshResolversRef.current) {
        resolveRefresh(false);
      }

      pendingRefreshResolversRef.current = [];
      pendingRefreshBuildLogsRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (hasStoredTheme || typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? 'dark' : 'light');
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [hasStoredTheme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let intervalId: number | undefined;
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return;

      void scheduleDashboardDataRefresh();
    };
    const syncPolling = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }

      if (document.visibilityState === 'visible') {
        refreshIfVisible();
        intervalId = window.setInterval(refreshIfVisible, 5000);
      }
    };

    syncPolling();
    document.addEventListener('visibilitychange', syncPolling);

    return () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }

      document.removeEventListener('visibilitychange', syncPolling);
    };
  }, [scheduleDashboardDataRefresh]);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';

    writeStoredTheme(nextTheme);
    setHasStoredTheme(true);
    setTheme(nextTheme);
  };

  const reloadDevices = async () => {
    await requestReloadDevices();
    await refreshDashboardData({ throwOnError: true });
  };

  const resetCache = async () => {
    await requestResetCache();
    await refreshDashboardData({ throwOnError: true });
  };

  const resetBundlerState = async () => {
    await requestResetBundlerState();
    queryClient.setQueryData(queryKeys.builds, []);
    queryClient.removeQueries({ queryKey: queryKeys.buildLogsRoot });
    await refreshDashboardData({ throwOnError: true });
  };

  const triggerBundlerFullBuild = async (bundlerId: string) => {
    clearBuildTriggerTimer(bundlerId);
    setTriggeringBuilds((current) => ({
      ...current,
      [bundlerId]: Date.now(),
    }));

    try {
      await requestTriggerBundlerFullBuild(bundlerId);
      await syncCompletedBuild(bundlerId);
    } catch (error) {
      completeBuildTrigger(bundlerId);
      throw error;
    }
  };

  const deleteBuildLogs = async (bundlerId: string) => {
    await requestDeleteBuildLogs(bundlerId);
    queryClient.setQueryData(queryKeys.buildLogs(bundlerId), []);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.snapshot }),
      queryClient.invalidateQueries({ queryKey: queryKeys.builds }),
    ]);
  };

  const loadConfig = () => {
    return queryClient.fetchQuery({
      queryKey: queryKeys.config,
      queryFn: requestGetConfig,
    });
  };

  const reloadDashboardData = () => {
    void refreshDashboardData({ notify: true });
  };

  return (
    <HashRouter>
      <div className="min-h-dvh bg-fd-background text-fd-foreground">
        <Header
          theme={theme}
          lastUpdatedAt={lastUpdatedAt}
          onToggleTheme={toggleTheme}
          onReloadData={reloadDashboardData}
        />
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[220px_1fr] md:px-6">
          <Sidebar />
          <main className="min-w-0">
            <DashboardActivityPages
              theme={theme}
              snapshot={visibleSnapshot}
              dataStatus={dataStatus}
              dataError={dataError}
              builds={builds}
              featureFlags={featureFlags}
              featureFlagsLoading={featureFlagsQuery.isPending}
              featureFlagsError={featureFlagsError}
              triggeringBuildIds={triggeringBuildIds}
              onLoadConfig={loadConfig}
              onTriggerFullBuild={triggerBundlerFullBuild}
              onDeleteBuildLogs={deleteBuildLogs}
              onReloadDevices={reloadDevices}
              onResetCache={resetCache}
              onResetBundlerState={resetBundlerState}
              onReloadDashboardData={reloadDashboardData}
            />
          </main>
        </div>
        <Toaster position="bottom-right" theme={theme} />
      </div>
    </HashRouter>
  );
}

function getErrorMessage(error: Error | null): string | null {
  return error == null ? null : error.message;
}

function DashboardActivityPages({
  theme,
  snapshot,
  dataStatus,
  dataError,
  builds,
  featureFlags,
  featureFlagsLoading,
  featureFlagsError,
  triggeringBuildIds,
  onLoadConfig,
  onTriggerFullBuild,
  onDeleteBuildLogs,
  onReloadDevices,
  onResetCache,
  onResetBundlerState,
  onReloadDashboardData,
}: {
  theme: Theme;
  snapshot: DashboardSnapshot | null;
  dataStatus: DataStatus;
  dataError: string | null;
  builds: Build[];
  featureFlags: FeatureFlags | null;
  featureFlagsLoading: boolean;
  featureFlagsError: string | null;
  triggeringBuildIds: ReadonlySet<string>;
  onLoadConfig: () => Promise<DashboardConfig>;
  onTriggerFullBuild: (bundlerId: string) => Promise<void>;
  onDeleteBuildLogs: (bundlerId: string) => Promise<void>;
  onReloadDevices: () => Promise<void>;
  onResetCache: () => Promise<void>;
  onResetBundlerState: () => Promise<void>;
  onReloadDashboardData: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = getCanonicalDashboardPath(location.pathname);
  const [visitedPaths, setVisitedPaths] = useState<Set<DashboardPagePath>>(
    () => new Set([activePath]),
  );

  useEffect(() => {
    if (activePath !== normalizeDashboardPath(location.pathname)) {
      void navigate(
        {
          pathname: activePath,
          search: location.search,
        },
        { replace: true },
      );
    }
  }, [activePath, location.pathname, location.search, navigate]);

  useEffect(() => {
    setVisitedPaths((current) => {
      if (current.has(activePath)) return current;

      const next = new Set(current);
      next.add(activePath);
      return next;
    });
  }, [activePath]);

  const renderWithSnapshot = (render: (visibleSnapshot: DashboardSnapshot) => ReactNode) => {
    if (snapshot == null) {
      return (
        <DashboardDataState
          status={dataStatus}
          errorMessage={dataError}
          onRetry={onReloadDashboardData}
        />
      );
    }

    return render(snapshot);
  };
  const renderActivityPage = ({
    path,
    name,
    children,
  }: {
    path: DashboardPagePath;
    name: string;
    children: ReactNode;
  }) => {
    const active = activePath === path;
    if (!active && !visitedPaths.has(path)) return null;

    return (
      <Activity key={path} mode={active ? 'visible' : 'hidden'} name={name}>
        {children}
      </Activity>
    );
  };

  return (
    <>
      {renderActivityPage({
        path: '/',
        name: 'Overview',
        children: renderWithSnapshot((visibleSnapshot) => (
          <OverviewPage
            theme={theme}
            bundlers={visibleSnapshot.bundlers}
            devices={visibleSnapshot.devices}
            project={visibleSnapshot.project}
            builds={builds}
            onLoadConfig={onLoadConfig}
          />
        )),
      })}
      {renderActivityPage({
        path: '/instances',
        name: 'Instances',
        children: renderWithSnapshot((visibleSnapshot) => (
          <InstancesPage
            theme={theme}
            bundlers={visibleSnapshot.bundlers}
            builds={builds}
            triggeringBuildIds={triggeringBuildIds}
            onTriggerFullBuild={onTriggerFullBuild}
          />
        )),
      })}
      {renderActivityPage({
        path: '/bundles',
        name: 'Bundles',
        children: renderWithSnapshot((visibleSnapshot) => (
          <BundlesPage theme={theme} bundlers={visibleSnapshot.bundlers} />
        )),
      })}
      {renderActivityPage({
        path: '/analyze',
        name: 'Analyze',
        children: renderWithSnapshot((visibleSnapshot) => (
          <AnalyzePage
            bundlers={visibleSnapshot.bundlers}
            featureFlags={featureFlags}
            featureFlagsLoading={featureFlagsLoading}
            featureFlagsErrorMessage={featureFlagsError}
          />
        )),
      })}
      {renderActivityPage({
        path: '/devices',
        name: 'Devices',
        children: renderWithSnapshot((visibleSnapshot) => (
          <DevicesPage theme={theme} devices={visibleSnapshot.devices} />
        )),
      })}
      {renderActivityPage({
        path: '/logs',
        name: 'Build Logs',
        children: renderWithSnapshot((visibleSnapshot) => (
          <LogsPage
            bundlers={visibleSnapshot.bundlers}
            builds={builds}
            onDeleteBuildLogs={onDeleteBuildLogs}
          />
        )),
      })}
      {renderActivityPage({
        path: '/actions',
        name: 'Actions',
        children: (
          <ActionsPage
            onReloadDevices={onReloadDevices}
            onResetCache={onResetCache}
            onResetBundlerState={onResetBundlerState}
          />
        ),
      })}
    </>
  );
}

function normalizeDashboardPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function getCanonicalDashboardPath(pathname: string): DashboardPagePath {
  switch (normalizeDashboardPath(pathname)) {
    case '/':
    case '/instances':
    case '/bundles':
    case '/analyze':
    case '/devices':
    case '/logs':
    case '/actions':
      return normalizeDashboardPath(pathname) as DashboardPagePath;
    case '/overview':
    case '/settings':
      return '/';
    case '/bundlers':
    case '/builds':
      return '/instances';
    default:
      return '/';
  }
}

function DashboardDataState({
  status,
  errorMessage,
  onRetry,
}: {
  status: DataStatus;
  errorMessage: string | null;
  onRetry: () => void;
}) {
  const isLoading = status === 'loading';

  return (
    <Card>
      <CardContent className="flex flex-col items-center py-8">
        <EmptyState
          icon={isLoading ? LoaderCircle : ServerCrash}
          title={isLoading ? 'Loading dashboard data' : 'Dashboard API unavailable'}
          description={
            isLoading ? undefined : (errorMessage ?? 'Start the Rollipop development server.')
          }
        />
        <Button type="button" variant="outline" disabled={isLoading} onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Reload
        </Button>
      </CardContent>
    </Card>
  );
}
