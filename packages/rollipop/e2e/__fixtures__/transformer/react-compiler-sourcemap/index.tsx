import { useMemo } from 'react';

import { useThrowingHook } from './use-throwing-hook';

type Props = { shouldThrow: boolean; value: string };

function ThrowingComponent({ shouldThrow, value }: Props) {
  const label = value.toUpperCase();
  if (shouldThrow) {
    throw new Error('component failure');
  }
  return <div>{label}</div>;
}

function ComponentWithHook({ shouldThrow, value }: Props) {
  const result = useThrowingHook(shouldThrow, value);
  return <div>{result.label}</div>;
}

function ComponentWithMemo({ shouldThrow, value }: Props) {
  const label = useMemo(() => {
    if (shouldThrow) {
      throw new Error('memo failure');
    }
    return value.toUpperCase();
  }, [shouldThrow, value]);
  return <div>{label}</div>;
}

globalThis.testComponents = { ThrowingComponent, ComponentWithHook, ComponentWithMemo };
