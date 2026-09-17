import { exclude, id } from '@rollipop/rolldown/filter';

import type { TransformRule } from '../../../config';

export const ROLLDOWN_RUNTIME_PATTERN = /rolldown\/runtime|@oxc-project\+runtime/;
export const ROLLDOWN_RUNTIME_EXCLUDE_FILTER = exclude(id(ROLLDOWN_RUNTIME_PATTERN));

export function withRuntimeExclude(filter: TransformRule['filter']): TransformRule['filter'] {
  if (filter == null || Array.isArray(filter)) {
    return [ROLLDOWN_RUNTIME_EXCLUDE_FILTER, ...(filter ?? [])];
  }

  const idFilter =
    typeof filter.id === 'string' || filter.id instanceof RegExp || Array.isArray(filter.id)
      ? { include: filter.id }
      : filter.id;
  const excludedIds = idFilter?.exclude ?? [];

  return {
    ...filter,
    id: {
      ...idFilter,
      exclude: [
        ROLLDOWN_RUNTIME_PATTERN,
        ...(Array.isArray(excludedIds) ? excludedIds : [excludedIds]),
      ],
    },
  };
}
