import { RefreshCw, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeading } from '../../components/layout/page-heading';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export function ActionsPage({
  onReloadDevices,
  onResetCache,
  onResetBundlerState,
}: {
  onReloadDevices: () => Promise<void>;
  onResetCache: () => Promise<void>;
  onResetBundlerState: () => Promise<void>;
}) {
  const [reloadingDevices, setReloadingDevices] = useState(false);
  const [resettingCache, setResettingCache] = useState(false);
  const [resettingBundlerState, setResettingBundlerState] = useState(false);

  const reloadDevices = async () => {
    setReloadingDevices(true);

    try {
      await onReloadDevices();
      toast.success('Reload message sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reload message');
    } finally {
      setReloadingDevices(false);
    }
  };

  const resetCache = async () => {
    setResettingCache(true);

    try {
      await onResetCache();
      toast.success('Filesystem cache reset complete');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset filesystem cache');
    } finally {
      setResettingCache(false);
    }
  };

  const resetBundlerState = async () => {
    setResettingBundlerState(true);

    try {
      await onResetBundlerState();
      toast.success('Development server state reset complete');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to reset development server state',
      );
    } finally {
      setResettingBundlerState(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Actions" />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Reload</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              className="text-primary-foreground dark:text-white"
              disabled={reloadingDevices}
              onClick={() => {
                void reloadDevices();
              }}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Reload
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reset Cache</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={resettingCache}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reset cache
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset cache?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Filesystem cache will be removed. Restart the development server to build from a
                    clean cache state.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      void resetCache();
                    }}
                  >
                    Reset cache
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reset Bundler State</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={resettingBundlerState}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reset state
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset bundler state?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Stored logs and collected development server state will be removed after the API
                    responds successfully.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      void resetBundlerState();
                    }}
                  >
                    Reset state
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
