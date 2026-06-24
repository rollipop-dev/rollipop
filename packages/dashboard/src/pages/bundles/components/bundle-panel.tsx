import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronsDown,
  ChevronsUp,
  CircleAlert,
  Copy,
  FileCode,
  HardDrive,
  ListOrdered,
  LoaderCircle,
  SearchCode,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CodeBlock } from '../../../components/dashboard/code-block';
import { DownloadFileButton } from '../../../components/dashboard/download-file-button';
import { EmptyState } from '../../../components/dashboard/empty-state';
import { Button } from '../../../components/ui/button';
import { ButtonGroup } from '../../../components/ui/button-group';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { getDevServerResourceUrl, symbolicateBundlePosition } from '../../../lib/api';
import { shortId } from '../../../lib/builds';
import type { BundlerInstance, SymbolicateResult, Theme } from '../../../types/dashboard';

const CODE_LINE_HEIGHT = 24;
const CODE_BLOCK_VERTICAL_PADDING = 32;
const POSITION_INPUT_DEBOUNCE_MS = 300;
const INITIAL_POSITION: BundlePosition = { line: 0, column: 0 };
const INITIAL_POSITION_INPUT = '1:1';
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');

interface BundlePosition {
  line: number;
  column: number;
}

interface LoadedBundle {
  text: string;
  sizeBytes: number;
  lineCount: number;
  lineOffsets: number[];
}

interface DownloadedBundle {
  text: string;
  sizeBytes: number;
}

interface RenderedBundleSlice {
  code: string;
  lineNumbers: Array<number | null>;
  focusLineIndex: number;
}

interface SymbolicateState {
  position: BundlePosition;
  result: SymbolicateResult;
}

export function BundlePanel({ bundler, theme }: { bundler: BundlerInstance | null; theme: Theme }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bundleCacheRef = useRef<Map<string, LoadedBundle>>(new Map());
  const [viewerHeight, setViewerHeight] = useState<number | null>(null);
  const [loadedBundle, setLoadedBundle] = useState<LoadedBundle | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [renderRequestId, setRenderRequestId] = useState(0);
  const [renderedSlice, setRenderedSlice] = useState<RenderedBundleSlice | null>(null);
  const [position, setPosition] = useState<BundlePosition>(INITIAL_POSITION);
  const [positionInput, setPositionInput] = useState(INITIAL_POSITION_INPUT);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [symbolicating, setSymbolicating] = useState(false);
  const [symbolicateState, setSymbolicateState] = useState<SymbolicateState | null>(null);
  const [symbolicateDialogOpen, setSymbolicateDialogOpen] = useState(false);
  const visibleLineCount = useMemo(() => {
    if (viewerHeight == null) return null;

    return Math.max(1, Math.floor((viewerHeight - CODE_BLOCK_VERTICAL_PADDING) / CODE_LINE_HEIGHT));
  }, [viewerHeight]);
  const maxLine = loadedBundle == null ? 0 : Math.max(0, loadedBundle.lineCount - 1);
  const positionControlsDisabled =
    bundler == null || loadedBundle == null || downloading || symbolicating;
  const parsedPositionInput = useMemo(
    () => parsePosition(positionInput, maxLine),
    [maxLine, positionInput],
  );
  const positionInputInvalid = loadedBundle != null && parsedPositionInput == null;
  const symbolicateDisabled = positionControlsDisabled || positionInputInvalid;
  const currentPosition = useMemo(
    () => (loadedBundle == null ? null : normalizePosition(loadedBundle, position)),
    [loadedBundle, position],
  );
  const canMoveToStart = currentPosition != null && currentPosition.line > 0;
  const canMoveToEnd = currentPosition != null && currentPosition.line < maxLine;
  const canMovePageUp = canMoveToStart;
  const canMovePageDown = canMoveToEnd;
  const pageControlsDisabled = positionControlsDisabled || visibleLineCount == null;

  useLayoutEffect(() => {
    const element = viewerRef.current;
    if (element == null) return;

    const syncHeight = () => {
      setViewerHeight(element.getBoundingClientRect().height);
    };

    syncHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncHeight);
      return () => window.removeEventListener('resize', syncHeight);
    }

    const observer = new ResizeObserver(syncHeight);
    observer.observe(element);

    return () => observer.disconnect();
  }, [bundler?.id]);

  useEffect(() => {
    setPosition(INITIAL_POSITION);
    setPositionInput(INITIAL_POSITION_INPUT);
    setRenderedSlice(null);
    setErrorMessage(null);
    setSymbolicateState(null);
    setSymbolicateDialogOpen(false);
    setSymbolicating(false);

    if (bundler == null) {
      setLoadedBundle(null);
      setDownloading(false);
      return;
    }

    const cachedBundle = bundleCacheRef.current.get(bundler.id);
    if (cachedBundle != null) {
      setLoadedBundle(cachedBundle);
      setDownloading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoadedBundle(null);
    setDownloading(true);

    void downloadBundleText(bundler.bundleUrl, controller.signal)
      .then((downloadedBundle) => {
        if (cancelled) return;

        const loaded = {
          text: downloadedBundle.text,
          sizeBytes: downloadedBundle.sizeBytes,
          lineCount: countBundleLines(downloadedBundle.text),
          lineOffsets: createLineOffsets(downloadedBundle.text),
        };

        bundleCacheRef.current.set(bundler.id, loaded);
        setLoadedBundle(loaded);
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;

        setErrorMessage(error instanceof Error ? error.message : 'Failed to download bundle');
      })
      .finally(() => {
        if (!cancelled) {
          setDownloading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bundler?.bundleUrl, bundler?.id]);

  useEffect(() => {
    if (loadedBundle == null || visibleLineCount == null) {
      setRenderedSlice(null);
      return;
    }

    let cancelled = false;

    const timerId = window.setTimeout(() => {
      const normalizedPosition = normalizePosition(loadedBundle, position);
      const nextRenderedSlice = readBundleSlice(loadedBundle, normalizedPosition, visibleLineCount);

      if (!cancelled) {
        setRenderedSlice(nextRenderedSlice);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [loadedBundle, position, renderRequestId, visibleLineCount]);

  useEffect(() => {
    if (loadedBundle == null || downloading || symbolicating || parsedPositionInput == null) return;

    const nextPosition = normalizePosition(loadedBundle, parsedPositionInput);
    if (isSamePosition(position, nextPosition)) return;

    const timerId = window.setTimeout(() => {
      setErrorMessage(null);
      setSymbolicateState(null);
      setSymbolicateDialogOpen(false);
      setPosition(nextPosition);
      setRenderRequestId((current) => current + 1);
    }, POSITION_INPUT_DEBOUNCE_MS);

    return () => window.clearTimeout(timerId);
  }, [downloading, loadedBundle, parsedPositionInput, position, symbolicating]);

  const moveByPage = (direction: -1 | 1) => {
    if (loadedBundle == null || visibleLineCount == null || currentPosition == null) return;
    if (direction === -1 && !canMovePageUp) return;
    if (direction === 1 && !canMovePageDown) return;

    const nextLine =
      direction === -1
        ? Math.max(0, currentPosition.line - visibleLineCount)
        : Math.min(maxLine, currentPosition.line + visibleLineCount);
    const nextPosition = normalizePosition(loadedBundle, {
      line: nextLine,
      column: currentPosition.column,
    });

    setErrorMessage(null);
    setSymbolicateState(null);
    setSymbolicateDialogOpen(false);
    setPositionInput(formatPosition(nextPosition));
    setPosition(nextPosition);
    setRenderRequestId((current) => current + 1);
  };
  const moveToBoundary = (line: 'start' | 'end') => {
    if (loadedBundle == null || visibleLineCount == null) return;
    if (line === 'start' && !canMoveToStart) return;
    if (line === 'end' && !canMoveToEnd) return;

    const nextPosition = normalizePosition(loadedBundle, {
      line: line === 'start' ? 0 : maxLine,
      column: 0,
    });

    setErrorMessage(null);
    setSymbolicateState(null);
    setSymbolicateDialogOpen(false);
    setPositionInput(formatPosition(nextPosition));
    setPosition(nextPosition);
    setRenderRequestId((current) => current + 1);
  };
  const updatePositionInput = (value: string) => {
    setSymbolicateState(null);
    setSymbolicateDialogOpen(false);
    setPositionInput(limitPositionInput(value, maxLine));
  };
  const resetInvalidPositionInput = () => {
    if (!positionInputInvalid || loadedBundle == null) return;

    const nextPosition = INITIAL_POSITION;

    setErrorMessage(null);
    setSymbolicateState(null);
    setSymbolicateDialogOpen(false);
    setPositionInput(formatPosition(nextPosition));
    setPosition(nextPosition);
    setRenderRequestId((current) => current + 1);
  };
  const copyBundleUrl = async () => {
    if (bundler == null) return;

    try {
      await navigator.clipboard.writeText(bundler.bundleUrl);
      toast.success('Bundle URL copied');
    } catch {
      toast.error('Failed to copy bundle URL');
    }
  };
  const symbolicateCurrentPosition = async () => {
    if (bundler == null || loadedBundle == null) return;

    const nextPosition = parsedPositionInput;
    if (nextPosition == null) return;

    const normalizedPosition = normalizePosition(loadedBundle, nextPosition);

    setErrorMessage(null);
    setSymbolicateState(null);
    setSymbolicateDialogOpen(false);
    setPositionInput(formatPosition(normalizedPosition));
    setPosition(normalizedPosition);
    setRenderRequestId((current) => current + 1);
    setSymbolicating(true);

    try {
      const result = await symbolicateBundlePosition({
        bundleUrl: bundler.bundleUrl,
        line: normalizedPosition.line,
        column: normalizedPosition.column,
      });

      setSymbolicateState({ position: normalizedPosition, result });
      setSymbolicateDialogOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to symbolicate position';
      toast.error(message);
    } finally {
      setSymbolicating(false);
    }
  };

  return (
    <>
      <Card className="h-[600px] gap-0">
        <CardHeader className="gap-3 pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Bundle ({bundler == null ? '-' : shortId(bundler.id)})</span>
              {loadedBundle != null && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="size-3.5" aria-hidden="true" />
                    {formatBytes(loadedBundle.sizeBytes)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ListOrdered className="size-3.5" aria-hidden="true" />
                    {loadedBundle.lineCount.toLocaleString()} lines
                  </span>
                </span>
              )}
            </CardTitle>
            {bundler != null && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <DownloadFileButton
                  href={bundler.bundleUrl}
                  fileName={`${bundler.id}.bundle`}
                  label="Bundle Download"
                />
                <DownloadFileButton
                  href={bundler.sourceMapUrl}
                  fileName={`${bundler.id}.bundle.map`}
                  label="Source Map Download"
                />
              </div>
            )}
          </div>
          {bundler != null && (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">Bundle URL</p>
                <div className="mt-1 flex min-w-0 items-center rounded-lg border bg-muted/40">
                  <p className="min-w-0 flex-1 truncate px-2 py-1.5 font-mono text-xs">
                    {bundler.bundleUrl}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy bundle URL"
                    title="Copy bundle URL"
                    onClick={() => {
                      void copyBundleUrl();
                    }}
                    className="mr-1"
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 xl:items-end">
                <p className="text-muted-foreground text-xs">Position</p>
                <div
                  className="flex max-w-full flex-col items-start gap-1.5 sm:flex-row sm:items-center"
                  role="group"
                  aria-label="Bundle viewer controls"
                >
                  <ButtonGroup>
                    <div className="relative">
                      <Input
                        value={positionInput}
                        onChange={(event) => updatePositionInput(event.target.value)}
                        onBlur={resetInvalidPositionInput}
                        placeholder="1:1"
                        aria-invalid={positionInputInvalid}
                        disabled={positionControlsDisabled}
                        className="w-[120px] rounded-r-none bg-background pr-8 font-mono focus:z-10"
                      />
                      {positionInputInvalid && (
                        <CircleAlert
                          className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2 size-4 text-destructive"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={symbolicateDisabled}
                      onClick={() => {
                        void symbolicateCurrentPosition();
                      }}
                      className="-ml-px rounded-l-none"
                    >
                      {symbolicating ? (
                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                      ) : (
                        <SearchCode aria-hidden="true" />
                      )}
                      Symbolicate
                    </Button>
                  </ButtonGroup>
                  <ButtonGroup>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move to bundle start"
                      title="Move to bundle start"
                      disabled={pageControlsDisabled || !canMoveToStart}
                      onClick={() => moveToBoundary('start')}
                      className="rounded-r-none"
                    >
                      <ArrowUpToLine aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move one page up"
                      title="Move one page up"
                      disabled={pageControlsDisabled || !canMovePageUp}
                      onClick={() => moveByPage(-1)}
                      className="-ml-px rounded-none"
                    >
                      <ChevronsUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move one page down"
                      title="Move one page down"
                      disabled={pageControlsDisabled || !canMovePageDown}
                      onClick={() => moveByPage(1)}
                      className="-ml-px rounded-none"
                    >
                      <ChevronsDown aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Move to bundle end"
                      title="Move to bundle end"
                      disabled={pageControlsDisabled || !canMoveToEnd}
                      onClick={() => moveToBoundary('end')}
                      className="-ml-px rounded-l-none"
                    >
                      <ArrowDownToLine aria-hidden="true" />
                    </Button>
                  </ButtonGroup>
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {errorMessage != null && bundler != null && loadedBundle == null ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={FileCode}
                title="Unable to load bundle"
                description={errorMessage}
              />
            </div>
          ) : bundler == null ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState icon={FileCode} title="Select a bundle" />
            </div>
          ) : (
            <>
              {errorMessage != null && (
                <p className="mb-3 text-destructive text-sm">{errorMessage}</p>
              )}
              <div ref={viewerRef} className="min-h-0 flex-1 overflow-hidden rounded-lg border">
                {loadedBundle == null || renderedSlice == null ? (
                  <BundleLoadingSpinner
                    label={downloading ? 'Downloading bundle' : 'Preparing bundle'}
                  />
                ) : (
                  <CodeBlock
                    code={renderedSlice.code}
                    language="javascript"
                    theme={theme}
                    lineNumbers={renderedSlice.lineNumbers}
                    highlightLineIndex={renderedSlice.focusLineIndex}
                    highlightLineNumber={currentPosition == null ? null : currentPosition.line + 1}
                    highlightColumn={currentPosition?.column ?? null}
                    trim={false}
                    scrollable={false}
                  />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <SymbolicateResultDialog
        open={symbolicateDialogOpen}
        onOpenChange={setSymbolicateDialogOpen}
        state={symbolicateState}
        theme={theme}
      />
    </>
  );
}

function SymbolicateResultDialog({
  open,
  onOpenChange,
  state,
  theme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SymbolicateState | null;
  theme: Theme;
}) {
  const result = state?.result ?? null;
  const codeFrame = result?.codeFrame ?? null;

  return (
    <Dialog open={open && state != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Symbolicate Result</DialogTitle>
          <DialogDescription>
            {state == null ? null : `Bundle position ${formatPosition(state.position)}`}
          </DialogDescription>
        </DialogHeader>
        {result != null && (
          <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
            <section className="grid gap-2">
              <p className="font-medium text-sm">Stack</p>
              <div className="overflow-hidden rounded-lg border">
                {result.stack.length === 0 ? (
                  <p className="px-3 py-2 text-muted-foreground text-sm">
                    No stack frames returned.
                  </p>
                ) : (
                  result.stack.map((frame, index) => (
                    <div
                      key={`${frame.file ?? 'unknown'}:${frame.lineNumber ?? '-'}:${frame.column ?? '-'}:${index}`}
                      className="grid gap-1 border-b px-3 py-2 last:border-b-0"
                    >
                      <p className="break-all font-mono text-xs">{formatStackFrame(frame)}</p>
                      {frame.methodName != null && (
                        <p className="text-muted-foreground text-xs">{frame.methodName}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
            {codeFrame != null && (
              <section className="grid gap-2">
                <p className="font-medium text-sm">Code Frame</p>
                <div className="h-[280px] overflow-hidden rounded-lg border">
                  <CodeBlock
                    code={stripAnsi(codeFrame.content)}
                    language={getLanguageFromFileName(codeFrame.fileName)}
                    theme={theme}
                    trim={false}
                    showLineNumbers={false}
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

async function downloadBundleText(href: string, signal: AbortSignal): Promise<DownloadedBundle> {
  const response = await fetch(getDevServerResourceUrl(href), { signal });
  if (!response.ok) {
    throw new Error(`Bundle download failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();

  return {
    text,
    sizeBytes: new TextEncoder().encode(text).byteLength,
  };
}

function BundleLoadingSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center">
      <LoaderCircle className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function createLineOffsets(text: string): number[] {
  const offsets = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function countBundleLines(text: string): number {
  if (text.length === 0) return 0;

  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10 && index < text.length - 1) {
      lines += 1;
    }
  }

  return lines;
}

function parsePosition(value: string, maxLine: number): BundlePosition | null {
  const match = /^([1-9]\d*):([1-9]\d*)$/.exec(value.trim());
  if (match == null) return null;

  return {
    line: Math.min(Number(match[1]) - 1, maxLine),
    column: Number(match[2]) - 1,
  };
}

function limitPositionInput(value: string, maxLine: number): string {
  const match = /^(\d+)(?::(\d*))?$/.exec(value.trim());
  if (match == null) return value;

  const line = Math.min(Math.max(1, Number(match[1])), maxLine + 1);
  const column = match[2];

  if (column == null) return String(line);
  if (column.length === 0) return `${line}:`;

  return `${line}:${Math.max(1, Number(column))}`;
}

function formatPosition(position: BundlePosition): string {
  return `${position.line + 1}:${position.column + 1}`;
}

function formatBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 ? String(size) : size.toFixed(size >= 10 ? 1 : 2);
  return `${formatted} ${units[unitIndex]}`;
}

function formatStackFrame(frame: SymbolicateResult['stack'][number]): string {
  return `${frame.file ?? 'unknown'}:${frame.lineNumber ?? '-'}:${frame.column ?? '-'}`;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function getLanguageFromFileName(fileName: string): string {
  if (fileName.endsWith('.tsx') || fileName.endsWith('.ts')) return 'tsx';
  if (fileName.endsWith('.jsx') || fileName.endsWith('.js')) return 'javascript';
  if (fileName.endsWith('.json')) return 'json';

  return 'text';
}

function normalizePosition(bundle: LoadedBundle, position: BundlePosition): BundlePosition {
  const line = Math.min(position.line, Math.max(0, bundle.lineOffsets.length - 1));
  const lineStart = bundle.lineOffsets[line] ?? bundle.text.length;
  const nextLineStart = bundle.lineOffsets[line + 1] ?? bundle.text.length;
  const lineEnd =
    nextLineStart > lineStart && bundle.text.charCodeAt(nextLineStart - 1) === 10
      ? nextLineStart - 1
      : nextLineStart;
  const column = Math.min(position.column, Math.max(0, lineEnd - lineStart));

  return { line, column };
}

function isSamePosition(left: BundlePosition, right: BundlePosition): boolean {
  return left.line === right.line && left.column === right.column;
}

function readBundleSlice(
  bundle: LoadedBundle,
  position: BundlePosition,
  visibleLineCount: number,
): RenderedBundleSlice {
  const centerLineIndex = Math.floor((visibleLineCount - 1) / 2);
  const maxStartLine = Math.max(0, bundle.lineCount - visibleLineCount);
  const startLine = Math.min(Math.max(0, position.line - centerLineIndex), maxStartLine);
  const focusLineIndex = Math.max(0, position.line - startLine);
  const endLine = Math.min(bundle.lineCount, startLine + visibleLineCount);
  const lines: string[] = [];
  const lineNumbers: Array<number | null> = [];

  for (let line = startLine; line < endLine; line += 1) {
    lines.push(readBundleLine(bundle, line));
    lineNumbers.push(line + 1);
  }

  return {
    code: lines.join('\n'),
    lineNumbers,
    focusLineIndex,
  };
}

function readBundleLine(bundle: LoadedBundle, line: number): string {
  const lineStart = bundle.lineOffsets[line] ?? bundle.text.length;
  const nextLineStart = bundle.lineOffsets[line + 1] ?? bundle.text.length;
  const lineEnd =
    nextLineStart > lineStart && bundle.text.charCodeAt(nextLineStart - 1) === 10
      ? nextLineStart - 1
      : nextLineStart;

  return bundle.text.slice(lineStart, lineEnd);
}
