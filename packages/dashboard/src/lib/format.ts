export function formatNullableDuration(durationMs: number | null) {
  if (durationMs == null) return '-';
  return formatDuration(durationMs);
}

export function formatDuration(durationMs: number) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
