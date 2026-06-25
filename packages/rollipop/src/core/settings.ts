import fs from 'node:fs';
import path from 'node:path';

import { merge } from 'es-toolkit';

import { FileStorage } from '../storage/file-storage';

export interface Settings {
  devtools?: {
    autoOpen?: boolean;
  };
}

export function getSettingsPath(basePath: string) {
  return path.join(FileStorage.getPath(basePath), 'settings.json');
}

export function loadSettings(basePath: string) {
  const settingsPath = getSettingsPath(basePath);
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Settings;
}

export function saveSettings(basePath: string, settings: Partial<Settings>) {
  const existingSettings = loadSettings(basePath);
  const newSettings = merge(existingSettings, settings);
  fs.writeFileSync(getSettingsPath(basePath), JSON.stringify(newSettings, null, 2));
}
