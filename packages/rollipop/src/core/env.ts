import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { invariant, isNotNil } from 'es-toolkit';

import type { Config } from '../config';
import { logger } from '../logger';

export interface LoadEnvOptions {
  envDir: string;
  envPrefix: string;
  envFile: string;
  mode?: Config['mode'];
}

export function loadEnv(options: LoadEnvOptions) {
  const { envDir, envPrefix, envFile, mode } = options;
  invariant(envPrefix.length > 0, '`envPrefix` is required');
  invariant(envFile.length > 0, '`envFile` is required');

  const env: Record<string, string> = {};
  const parsed: Record<string, string> = {};
  const envFilesToLoad = [
    envFile,
    `${envFile}.local`,
    mode ? `${envFile}.${mode}` : null,
    mode ? `${envFile}.${mode}.local` : null,
  ].filter(isNotNil);

  for (const file of envFilesToLoad) {
    const envPath = path.resolve(envDir, file);

    if (!fs.existsSync(envPath)) {
      continue;
    }

    logger.trace(`Loading environment variables from ${envPath}`);
    Object.assign(parsed, dotenv.parse(fs.readFileSync(envPath, 'utf-8')));
  }

  // Expand only after applying file and shell precedence, without mutating process.env.
  const processEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      processEnv[key] = value;
      if (key in parsed) {
        parsed[key] = value;
      }
    }
  }
  const expanded = dotenvExpand.expand({ parsed, processEnv });
  for (const [key, value] of Object.entries(expanded.parsed ?? {})) {
    if (key.startsWith(envPrefix)) {
      env[key] = process.env[key] ?? value;
    }
  }

  logger.trace('Loaded environment variables:', env);

  return env;
}
