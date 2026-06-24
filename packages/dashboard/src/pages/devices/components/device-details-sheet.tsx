import { Bug } from 'lucide-react';
import { useState } from 'react';

import { CodeBlock } from '../../../components/dashboard/code-block';
import { Button } from '../../../components/ui/button';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { shortId } from '../../../lib/builds';
import type { ConnectedDevice, Theme } from '../../../types/dashboard';

export function DeviceDetailsSheet({
  open,
  onOpenChange,
  theme,
  device,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  device: ConnectedDevice | null;
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (device == null) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const targetJson = JSON.stringify(
    device.debugTarget ?? {
      id: device.id,
      title: device.name,
      type: 'unknown',
    },
    null,
    2,
  );

  const openDebugger = () => {
    if (device.debuggerUrl != null) {
      window.open(device.debuggerUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setErrorMessage('Debugger URL is unavailable for this device.');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 data-[side=right]:h-dvh data-[side=right]:w-[calc(100vw-2rem)] data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>{device.name}</SheetTitle>
          <p className="font-mono text-muted-foreground text-sm">ID {shortId(device.id)}</p>
          <div className="pt-3">
            <Button type="button" variant="outline" size="sm" onClick={openDebugger}>
              <Bug className="size-4" aria-hidden="true" />
              Open debugger
            </Button>
            {errorMessage != null && (
              <p className="mt-2 text-destructive text-sm">{errorMessage}</p>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4">
            <section className="grid gap-3">
              <h3 className="font-medium text-sm">DevTools Target</h3>
              <div className="max-h-[calc(100dvh-13rem)] overflow-hidden rounded-lg border">
                <CodeBlock code={targetJson} language="json" theme={theme} />
              </div>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
