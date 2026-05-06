import { VIRTUAL_PREFIX } from '../constants';

export function resolveVirtualId(source: string) {
  if (source.startsWith(VIRTUAL_PREFIX)) {
    return source;
  }
  return null;
}
