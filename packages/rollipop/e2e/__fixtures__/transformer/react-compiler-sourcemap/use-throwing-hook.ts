export function useThrowingHook(shouldThrow: boolean, value: string) {
  'use memo';

  const label = value.toUpperCase();
  if (shouldThrow) {
    throw new Error('hook failure');
  }
  return { label };
}
