import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, FileCode, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { EmptyState } from '../../../components/dashboard/empty-state';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { getHmrChunks } from '../../../lib/api';
import { formatDateTime } from '../../../lib/format';
import { queryKeys } from '../../../lib/query';
import type { HmrChunk, Theme } from '../../../types/dashboard';
import { BundlePanel } from './bundle-panel';

const EMPTY_CHUNKS: HmrChunk[] = [];

export function HmrChunksPanel({
  bundlerId,
  active,
  theme,
}: {
  bundlerId: string | null;
  active: boolean;
  theme: Theme;
}) {
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const chunksQuery = useQuery({
    queryKey: queryKeys.hmrChunks(bundlerId ?? ''),
    queryFn: () => getHmrChunks(bundlerId!),
    enabled: active && bundlerId != null,
  });
  const chunks = chunksQuery.data ?? EMPTY_CHUNKS;
  const selectedChunk =
    chunks.find((chunk) => chunk.filename === selectedFilename) ?? chunks[0] ?? null;
  const loading = bundlerId != null && chunksQuery.isPending;
  const errorMessage = chunksQuery.error instanceof Error ? chunksQuery.error.message : null;

  useEffect(() => {
    setSelectedFilename(selectedChunk?.filename ?? null);
  }, [selectedChunk?.filename]);

  const title = (
    <>
      <HmrChunkCombobox
        chunks={chunks}
        selectedFilename={selectedChunk?.filename ?? null}
        onSelect={setSelectedFilename}
      />
      <span className="text-muted-foreground text-sm font-normal">
        {loading
          ? 'Loading chunks...'
          : `${chunks.length} ${chunks.length === 1 ? 'chunk' : 'chunks'}`}
      </span>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {errorMessage != null && (
        <div className="flex items-center gap-3" role="alert">
          <p className="text-destructive text-sm">Unable to load HMR chunks: {errorMessage}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={chunksQuery.isFetching}
            onClick={() => {
              void chunksQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {selectedChunk != null ? (
        <BundlePanel
          source={{
            kind: 'hmr',
            cacheKey: `${selectedChunk.filename}:${selectedChunk.updatedAt}`,
            title: `HMR chunk (${selectedChunk.filename})`,
            filename: selectedChunk.filename,
            bundleUrl: selectedChunk.bundleUrl,
            sourceMapUrl: selectedChunk.sourceMapUrl,
          }}
          theme={theme}
          title={title}
        />
      ) : (
        <Card className="h-[600px] gap-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">{title}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 items-center justify-center">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                <span>Loading HMR chunks</span>
              </div>
            ) : (
              <EmptyState
                icon={FileCode}
                title={
                  bundlerId == null
                    ? 'Select a bundle'
                    : errorMessage != null
                      ? 'Unable to load HMR chunks'
                      : 'No HMR chunks yet'
                }
                description={
                  bundlerId != null && errorMessage == null
                    ? 'Chunks appear after a hot update for this bundle.'
                    : undefined
                }
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HmrChunkCombobox({
  chunks,
  selectedFilename,
  onSelect,
}: {
  chunks: HmrChunk[];
  selectedFilename: string | null;
  onSelect: (filename: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="HMR chunk"
          aria-expanded={open}
          disabled={chunks.length === 0}
          className="w-[360px] max-w-full justify-between"
        >
          <span className="truncate font-mono">{selectedFilename ?? 'Select HMR chunk'}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder="Search HMR chunks..." />
          <CommandList>
            <CommandEmpty>No HMR chunk found.</CommandEmpty>
            <CommandGroup>
              {chunks.map((chunk) => (
                <CommandItem
                  key={chunk.filename}
                  value={chunk.filename}
                  className="cursor-pointer"
                  data-checked={chunk.filename === selectedFilename}
                  onSelect={() => {
                    onSelect(chunk.filename);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono">{chunk.filename}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(new Date(chunk.updatedAt).toISOString())}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
