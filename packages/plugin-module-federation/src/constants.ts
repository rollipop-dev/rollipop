export const PLUGIN_NAME = 'rollipop:module-federation';

export const VIRTUAL_PREFIX = '\0rollipop:module-federation:';
export const VIRTUAL_HOST_INIT_ID = `${VIRTUAL_PREFIX}host-init`;
export const VIRTUAL_RUNTIME_ADAPTER_ID = `${VIRTUAL_PREFIX}runtime-adapter`;
export const VIRTUAL_SHARE_SCOPE_ID = `${VIRTUAL_PREFIX}share-scope`;
export const VIRTUAL_REMOTE_ENTRY_ID = `${VIRTUAL_PREFIX}remote-entry`;
export const VIRTUAL_SHARED_SHIM_PREFIX = `${VIRTUAL_PREFIX}shared:`;
export const VIRTUAL_REMOTE_PROXY_PREFIX = `${VIRTUAL_PREFIX}remote:`;

export const SCRIPT_LOADER_GLOBAL = '__rollipop_script_loader__';
export const SHARED_REGISTRY_GLOBAL = '__rollipop_shared__';
export const REMOTE_CACHE_GLOBAL = '__rollipop_module_federation_cache__';

export const HMR_HOT_PATH = '/hot';
export const HMR_EVENT = 'mf:remote-update';
