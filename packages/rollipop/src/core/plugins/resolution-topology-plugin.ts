/**
 * Temporary bridge for extensionless resolution topology changes in Rolldown dev mode.
 *
 * Rolldown currently keeps stale resolver entries across watch events and does not yet map a newly created resolution candidate back to its importer:
 * - https://github.com/rolldown/rolldown/issues/10487
 *
 * Vite tracks the equivalent extensionless rename failure and proposes adding importers of sibling extension candidates to the HMR update on create/delete:
 * - https://github.com/vitejs/vite/issues/21157
 * - https://github.com/vitejs/vite/pull/22370
 *
 * Keep this logic here only until Rolldown owns the resolution dependency topology and can re-resolve the affected importers itself.
 */
import fs from 'node:fs';
import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import {
  ResolverFactory,
  type ResolveOptions as ResolverFactoryOptions,
} from '@rollipop/rolldown/experimental';
import { and, id, importerId, include, not } from '@rollipop/rolldown/filter';

import type { PluginWithHotUpdate } from '../../types';

interface ResolutionEdge {
  key: string;
  importer: string;
  importerFile: string;
  request: string;
  suffix: string;
  target: string;
  directories: string[];
}

interface FileSnapshot {
  device: bigint;
  inode: bigint;
  size: bigint;
  modifiedAt: bigint;
  changedAt: bigint;
}

type ResolutionOverride =
  | {
      result: {
        id: string;
        packageJsonPath?: string;
      };
    }
  | { error: string };

export interface ResolutionTopologyPluginOptions {
  root: string;
  resolve: NonNullable<rolldown.InputOptions['resolve']>;
  tsconfig?: boolean | string;
}

const NODE_MODULES_PATTERN = /\/node_modules\//;
const RELATIVE_REQUEST_PATTERN = /^\.\.?\//;
const RESOLVABLE_IMPORT_KINDS = new Set([
  'dynamic-import',
  'hot-accept',
  'import-statement',
  'require-call',
]);

function resolutionTopologyPlugin(options?: ResolutionTopologyPluginOptions) {
  if (options == null) {
    return null;
  }

  const pluginOptions = options;
  const root = path.resolve(pluginOptions.root);
  const trackableRoots = [...new Set([root, realpath(root)])];
  const rootPattern = new RegExp(
    `^(?:${trackableRoots.map((root) => escapeRegExp(toSlash(root))).join('|')})(?:/|$)`,
  );
  const edges = new Map<string, ResolutionEdge>();
  const edgeKeysByDirectory = new Map<string, Set<string>>();
  const edgeKeysByImporter = new Map<string, Set<string>>();
  const edgeKeysByImporterFile = new Map<string, Set<string>>();
  const edgeKeysToRevalidate = new Set<string>();
  const watchedDirectories = new Set<string>();
  const initialFileSnapshots = new Map<string, FileSnapshot>();
  const overrides = new Map<string, ResolutionOverride>();
  let resolver: ResolverFactory | undefined;

  function clear() {
    edges.clear();
    edgeKeysByDirectory.clear();
    edgeKeysByImporter.clear();
    edgeKeysByImporterFile.clear();
    edgeKeysToRevalidate.clear();
    watchedDirectories.clear();
    initialFileSnapshots.clear();
    overrides.clear();
    resolver = undefined;
  }

  function unlinkEdge(edge: ResolutionEdge) {
    for (const directory of edge.directories) {
      unlinkKey(edgeKeysByDirectory, directory, edge.key);
    }
    unlinkKey(edgeKeysByImporter, edge.importer, edge.key);
    unlinkKey(edgeKeysByImporterFile, edge.importerFile, edge.key);
  }

  function forgetEdge(key: string, revalidate = false) {
    const edge = edges.get(key);
    if (edge == null) {
      return;
    }
    unlinkEdge(edge);
    edges.delete(key);
    overrides.delete(key);
    if (revalidate) {
      edgeKeysToRevalidate.add(key);
    } else {
      edgeKeysToRevalidate.delete(key);
    }
  }

  function forgetImporter(importer: string, revalidate = false) {
    for (const key of edgeKeysByImporter.get(importer) ?? []) {
      forgetEdge(key, revalidate);
    }
  }

  function updateOverride(edge: ResolutionEdge) {
    resolver ??= new ResolverFactory(toResolverFactoryOptions(pluginOptions));
    const result = resolver.resolveFileSync(edge.importerFile, edge.request);

    edgeKeysToRevalidate.delete(edge.key);
    if (result.path != null) {
      overrides.set(edge.key, {
        result: {
          id: `${result.path}${edge.suffix}`,
          ...(result.packageJsonPath == null ? null : { packageJsonPath: result.packageJsonPath }),
        },
      });
    } else {
      overrides.set(edge.key, {
        error: result.error ?? `Could not resolve '${edge.request}' from '${edge.importerFile}'.`,
      });
    }
  }

  function rememberEdge(
    context: rolldown.PluginContext,
    source: string,
    importer: string,
    kind: string,
  ) {
    const { pathname: request, suffix } = splitRequest(source);
    const graphImporter = toSlash(importer);
    const importerFile = path.normalize(stripQuery(importer));
    const key = `${graphImporter}\0${kind}\0${source}`;
    const target = path.resolve(path.dirname(importerFile), request);
    const directories = [path.dirname(target), ...(isDirectory(target) ? [target] : [])].map(
      path.normalize,
    );
    const previous = edges.get(key);

    if (previous != null) {
      unlinkEdge(previous);
    }

    const edge = {
      key,
      importer: graphImporter,
      importerFile,
      request,
      suffix,
      target,
      directories,
    };
    edges.set(key, edge);
    for (const directory of directories) {
      linkKey(edgeKeysByDirectory, directory, key);
      if (!watchedDirectories.has(directory)) {
        watchedDirectories.add(directory);
        context.addWatchFile(directory);
      }
    }
    linkKey(edgeKeysByImporter, graphImporter, key);
    linkKey(edgeKeysByImporterFile, importerFile, key);
    if (previous == null) {
      rememberInitialFileSnapshot(initialFileSnapshots, importerFile);
      for (const candidate of getResolutionCandidates(edge, pluginOptions.resolve)) {
        rememberInitialFileSnapshot(initialFileSnapshots, candidate);
      }
    }
    return edge;
  }

  function findAffectedEdges(file: string, directoryUpdate: boolean) {
    const normalizedFile = path.normalize(file);
    const exactDirectoryKeys = edgeKeysByDirectory.get(normalizedFile) ?? [];
    if (directoryUpdate) {
      return new Set(exactDirectoryKeys);
    }

    const candidateKeys = new Set([
      ...exactDirectoryKeys,
      ...(edgeKeysByDirectory.get(path.dirname(normalizedFile)) ?? []),
    ]);

    return new Set(
      [...candidateKeys].filter((key) => {
        const edge = edges.get(key);
        return edge != null && canAffectResolution(edge, normalizedFile, pluginOptions.resolve);
      }),
    );
  }

  function isInitialCreate(file: string, affectedKeys: Set<string>) {
    if (affectedKeys.size === 0 && !edgeKeysByImporterFile.has(path.normalize(file))) {
      return false;
    }

    return matchesInitialFileSnapshot(initialFileSnapshots, file);
  }

  const plugin: PluginWithHotUpdate = {
    name: 'rollipop:resolution-topology',
    buildStart() {
      clear();
    },
    resolveId: {
      order: 'post',
      filter: [
        include(
          and(
            id(RELATIVE_REQUEST_PATTERN, { cleanUrl: true }),
            importerId(rootPattern, { cleanUrl: true }),
            not(importerId(NODE_MODULES_PATTERN, { cleanUrl: true })),
          ),
        ),
      ],
      handler(source, importer, extraOptions) {
        if (
          importer == null ||
          !RESOLVABLE_IMPORT_KINDS.has(extraOptions.kind) ||
          !isTrackableRequest(trackableRoots, source, importer)
        ) {
          return null;
        }

        const edge = rememberEdge(this, source, importer, extraOptions.kind);
        if (edgeKeysToRevalidate.has(edge.key)) {
          updateOverride(edge);
        }
        const override = overrides.get(edge.key);
        if (override == null) {
          return null;
        }
        if ('error' in override) {
          return this.error(override.error);
        }
        return override.result;
      },
    },
    watchChange(id, { event }) {
      const normalizedId = path.normalize(id);
      const isReplayedCreate =
        event === 'create' && matchesInitialFileSnapshot(initialFileSnapshots, normalizedId);
      if (!isReplayedCreate) {
        initialFileSnapshots.delete(normalizedId);
        const importerStillExists = fs.existsSync(normalizedId);
        const importers = new Set<string>();
        for (const key of edgeKeysByImporterFile.get(normalizedId) ?? []) {
          const importer = edges.get(key)?.importer;
          if (importer != null) {
            importers.add(importer);
          }
        }
        for (const importer of importers) {
          forgetImporter(importer, importerStillExists);
        }
      }
      resolver?.clearCache();
    },
    hotUpdate({ type, file, modules }) {
      const normalizedFile = path.normalize(file);
      const fileExists = fs.existsSync(normalizedFile);
      const directoryUpdate = type === 'update' && fileExists && isDirectory(normalizedFile);
      const affectedKeys = findAffectedEdges(normalizedFile, directoryUpdate);

      // Directory watches can replay pre-existing files as creates when the watcher starts.
      if (type === 'create' && isInitialCreate(normalizedFile, affectedKeys)) {
        return [];
      }
      if (
        type === 'update' &&
        fileExists &&
        !directoryUpdate &&
        path.basename(normalizedFile) !== 'package.json' &&
        modules.length > 0
      ) {
        return undefined;
      }
      if (affectedKeys.size === 0) {
        return undefined;
      }

      const selectedModules = new Set(modules);
      if (type === 'update' && !fileExists) {
        for (const moduleId of modules) {
          if (toSlash(stripQuery(moduleId)) !== toSlash(normalizedFile)) {
            continue;
          }
          selectedModules.delete(moduleId);
          for (const importer of this.getModuleInfo(moduleId)?.importers ?? []) {
            selectedModules.add(importer);
          }
        }
      }

      let topologyChanged = false;

      for (const key of affectedKeys) {
        const edge = edges.get(key);
        if (edge == null) {
          continue;
        }
        if (this.getModuleInfo(edge.importer) == null) {
          forgetImporter(edge.importer);
          continue;
        }

        updateOverride(edge);
        selectedModules.add(edge.importer);
        topologyChanged = true;
      }

      return topologyChanged ? [...selectedModules] : undefined;
    },
  };

  return plugin;
}

function isTrackableRequest(roots: string[], source: string, importer: string) {
  const cleanImporter = path.normalize(stripQuery(importer));
  const request = splitRequest(source).pathname;

  return (
    RELATIVE_REQUEST_PATTERN.test(request) &&
    path.posix.extname(request) === '' &&
    roots.some((root) => isWithinRoot(root, cleanImporter)) &&
    !NODE_MODULES_PATTERN.test(toSlash(cleanImporter))
  );
}

function isWithinRoot(root: string, file: string) {
  const relativeFile = path.relative(root, file);
  return (
    relativeFile !== '..' &&
    !relativeFile.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativeFile)
  );
}

function realpath(file: string) {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

function isDirectory(file: string) {
  return fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function rememberInitialFileSnapshot(snapshots: Map<string, FileSnapshot>, file: string) {
  if (snapshots.has(file)) {
    return;
  }

  const snapshot = getFileSnapshot(file);
  if (snapshot != null) {
    snapshots.set(file, snapshot);
  }
}

function matchesInitialFileSnapshot(snapshots: Map<string, FileSnapshot>, file: string) {
  const initial = snapshots.get(file);
  const current = getFileSnapshot(file);
  return (
    initial != null &&
    current != null &&
    initial.device === current.device &&
    initial.inode === current.inode &&
    initial.size === current.size &&
    initial.modifiedAt === current.modifiedAt &&
    initial.changedAt === current.changedAt
  );
}

function getFileSnapshot(file: string): FileSnapshot | undefined {
  const stat = fs.statSync(file, { bigint: true, throwIfNoEntry: false });
  if (stat == null) {
    return undefined;
  }

  return {
    device: stat.dev,
    inode: stat.ino,
    size: stat.size,
    modifiedAt: stat.mtimeNs,
    changedAt: stat.ctimeNs,
  };
}

function canAffectResolution(
  edge: ResolutionEdge,
  file: string,
  resolve: NonNullable<rolldown.InputOptions['resolve']>,
) {
  return getResolutionCandidates(edge, resolve).has(file);
}

function getResolutionCandidates(
  edge: ResolutionEdge,
  resolve: NonNullable<rolldown.InputOptions['resolve']>,
) {
  const extensions = ['', ...(resolve.extensions ?? ['.js', '.json', '.node'])];
  const mainFiles = resolve.mainFiles ?? ['index'];
  return new Set([
    ...extensions.map((extension) => `${edge.target}${extension}`),
    path.join(edge.target, 'package.json'),
    ...mainFiles.flatMap((mainFile) =>
      extensions.map((extension) => path.join(edge.target, `${mainFile}${extension}`)),
    ),
  ]);
}

function toResolverFactoryOptions({
  root,
  resolve,
  tsconfig,
}: ResolutionTopologyPluginOptions): ResolverFactoryOptions {
  const alias = resolve.alias
    ? Object.fromEntries(
        Object.entries(resolve.alias).map(([key, value]) => [
          key,
          (Array.isArray(value) ? value : [value]).map((item) => (item === false ? null : item)),
        ]),
      )
    : undefined;
  const tsconfigFile =
    typeof tsconfig === 'string'
      ? tsconfig
      : typeof resolve.tsconfigFilename === 'string'
        ? resolve.tsconfigFilename
        : undefined;

  return {
    alias,
    aliasFields: resolve.aliasFields,
    conditionNames: resolve.conditionNames,
    exportsFields: resolve.exportsFields,
    extensionAlias: resolve.extensionAlias,
    extensions: resolve.extensions,
    mainFields: resolve.mainFields,
    mainFiles: resolve.mainFiles,
    modules: resolve.modules,
    symlinks: resolve.symlinks,
    ...(tsconfig === false
      ? null
      : {
          tsconfig:
            tsconfigFile == null ? 'auto' : { configFile: path.resolve(root, tsconfigFile) },
        }),
  };
}

function linkKey(index: Map<string, Set<string>>, id: string, key: string) {
  const keys = index.get(id) ?? new Set<string>();
  keys.add(key);
  index.set(id, keys);
}

function unlinkKey(index: Map<string, Set<string>>, id: string, key: string) {
  const keys = index.get(id);
  keys?.delete(key);
  if (keys?.size === 0) {
    index.delete(id);
  }
}

function splitRequest(request: string) {
  const suffixIndex = request.search(/[?#]/);
  return suffixIndex === -1
    ? { pathname: request, suffix: '' }
    : { pathname: request.slice(0, suffixIndex), suffix: request.slice(suffixIndex) };
}

function stripQuery(id: string) {
  return splitRequest(id).pathname;
}

function toSlash(value: string) {
  return value.replaceAll('\\', '/');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { resolutionTopologyPlugin as resolutionTopology };
