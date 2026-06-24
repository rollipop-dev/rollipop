import { FileCode2 } from 'lucide-react';
import { useState } from 'react';

import { CodeBlock } from '../../../components/dashboard/code-block';
import { Button } from '../../../components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../../components/ui/sheet';
import type { DashboardConfig, Theme } from '../../../types/dashboard';

export function ConfigViewer({
  theme,
  configPath,
  onLoadConfig,
  triggerLabel = 'Config',
  triggerSize = 'default',
}: {
  theme: Theme;
  configPath: string | null;
  onLoadConfig: () => Promise<DashboardConfig>;
  triggerLabel?: string;
  triggerSize?: 'xs' | 'sm' | 'default';
}) {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadConfig = async (open: boolean) => {
    if (!open || config != null) {
      return;
    }

    try {
      setErrorMessage(null);
      setConfig(await onLoadConfig());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load config.');
    }
  };

  return (
    <Sheet
      onOpenChange={(open) => {
        void loadConfig(open);
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size={triggerSize}>
          <FileCode2 className="h-4 w-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 p-0 data-[side=right]:h-dvh data-[side=right]:w-[calc(100vw-2rem)] data-[side=right]:sm:max-w-3xl data-[side=right]:lg:max-w-5xl">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Config</SheetTitle>
          <div className="mt-3 flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
            <FileCode2 className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate font-mono">
              {config?.path ?? configPath ?? 'Config path unavailable'}
            </span>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <CodeBlock
            code={config?.serialized ?? errorMessage ?? 'Loading config...'}
            language={config == null && errorMessage != null ? 'text' : 'json'}
            theme={theme}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
