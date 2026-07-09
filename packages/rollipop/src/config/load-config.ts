import path from 'node:path';

import * as c12 from 'c12';
import { invariant, omit } from 'es-toolkit';

import { createPluginContext } from '../core/plugins/context';
import type { Plugin, PluginConfig, ResolvedPluginConfig } from '../core/plugins/types';
import { getDefaultConfig, type ResolvedConfig } from './defaults';
import { DefineConfigContext } from './define-config';
import { mergeConfig } from './merge-config';
import { printConfigNotice } from './notice';
import type { Config, PluginOption } from './types';

const CONFIG_FILE_NAME = 'rollipop';
const INTERNAL_PLUGIN_HOOKS = ['transformCacheHit'] as const;

export interface LoadConfigOptions {
  cwd?: string;
  configFile?: string;
  mode?: Config['mode'];
  context?: Omit<DefineConfigContext, 'defaultConfig'>;
}

export async function loadConfig(options: LoadConfigOptions = {}) {
  const { cwd = process.cwd(), configFile, mode, context = {} } = options;

  const defaultConfig = await getDefaultConfig(cwd, mode);
  const commonOptions: c12.LoadConfigOptions = {
    context: { ...context, defaultConfig },
    rcFile: false,
  };

  const { config: userConfig, configFile: resolvedConfigFile } = await c12.loadConfig<Config>(
    configFile
      ? { configFile: path.resolve(cwd, configFile), configFileRequired: true }
      : {
          cwd,
          defaultConfig,
          name: CONFIG_FILE_NAME,
          ...commonOptions,
        },
  );
  invariant(resolvedConfigFile != null, 'Failed to get resolved config file');

  const plugins = await flattenPluginOption(userConfig.plugins);
  // Pre-merge defaults so the `config` hook sees the fully-resolved config and mutations
  // (including removing entries from default arrays like `resolve.assetExtensions`) are preserved as the final result.
  const baseConfig = mergeConfig(defaultConfig, { ...userConfig, plugins });
  const pluginConfig = await resolvePluginConfig(baseConfig, plugins);
  const resolvedConfig: ResolvedConfig = {
    ...pluginConfig,
    configFile: resolvedConfigFile,
    plugins,
  };

  if (!path.isAbsolute(resolvedConfig.entry)) {
    resolvedConfig.entry = path.resolve(resolvedConfig.root, resolvedConfig.entry);
  }

  await invokeConfigResolved(resolvedConfig, plugins);
  printConfigNotice(resolvedConfig);

  return resolvedConfig;
}

export async function flattenPluginOption(pluginOption: PluginOption): Promise<Plugin[]> {
  const awaitedPluginOption = await pluginOption;

  if (Array.isArray(awaitedPluginOption)) {
    const plugins = await Promise.all(awaitedPluginOption.map(flattenPluginOption));
    return plugins.flat();
  }

  if (awaitedPluginOption == null || awaitedPluginOption === false) {
    return [];
  }

  return [stripInternalPluginHooks(awaitedPluginOption as Plugin)];
}

function stripInternalPluginHooks(plugin: Plugin): Plugin {
  const maybeInternalPlugin = plugin as Plugin &
    Partial<Record<(typeof INTERNAL_PLUGIN_HOOKS)[number], unknown>>;

  if (!INTERNAL_PLUGIN_HOOKS.some((hook) => hook in maybeInternalPlugin)) {
    return plugin;
  }

  return omit(maybeInternalPlugin, INTERNAL_PLUGIN_HOOKS) as Plugin;
}

export function resolvePluginConfig(
  baseConfig: ResolvedConfig,
  plugins: Plugin[],
): Promise<ResolvedPluginConfig>;
export function resolvePluginConfig(baseConfig: Config, plugins: Plugin[]): Promise<PluginConfig>;
export async function resolvePluginConfig(
  baseConfig: Config,
  plugins: Plugin[],
): Promise<PluginConfig> {
  let mergedConfig: PluginConfig = omit(baseConfig, ['plugins']);

  for (const plugin of plugins) {
    const context = createPluginContext(plugin.name);
    const rolldownOptionsBefore = mergedConfig.rolldownOptions;

    if (typeof plugin.config === 'function') {
      const config = await plugin.config.call(context, mergedConfig);
      if (config != null) {
        mergedConfig = mergeConfig(mergedConfig, config);
      }
    } else if (typeof plugin.config === 'object') {
      mergedConfig = mergeConfig(mergedConfig, plugin.config);
    }

    const rolldownOptionsAfter = mergedConfig.rolldownOptions;
    if (rolldownOptionsAfter != null && rolldownOptionsAfter !== rolldownOptionsBefore) {
      context.debug({ message: `set 'rolldownOptions'` });
    }
  }

  return mergedConfig;
}

export async function invokeConfigResolved(config: ResolvedConfig, plugins: Plugin[]) {
  await Promise.all(
    plugins.map((plugin) => {
      const context = createPluginContext(plugin.name);
      return Promise.resolve(plugin.configResolved?.call(context, config));
    }),
  );
}
