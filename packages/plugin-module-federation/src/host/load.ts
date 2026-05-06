import {
  VIRTUAL_HOST_INIT_ID,
  VIRTUAL_RUNTIME_ADAPTER_ID,
  VIRTUAL_SHARE_SCOPE_ID,
} from '../constants';
import type { NormalizedConfig } from '../types';
import { generateHostInitCode } from '../virtual/host-init';
import { generateRuntimeAdapterCode } from '../virtual/runtime-adapter';
import { generateShareScopeCode } from '../virtual/share-scope';

export function loadVirtualModule(id: string, config: NormalizedConfig) {
  switch (id) {
    case VIRTUAL_RUNTIME_ADAPTER_ID:
      return generateRuntimeAdapterCode();
    case VIRTUAL_HOST_INIT_ID:
      return generateHostInitCode(config);
    case VIRTUAL_SHARE_SCOPE_ID:
      return generateShareScopeCode();
    default:
      return null;
  }
}
