import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi, vitest } from 'vite-plus/test';

import type { FileStorageData } from '../../../common/types';
import { ensureSharedDataPath } from '../data';
import { FileStorage } from '../storage';

vitest.mock('../data', () => ({
  ensureSharedDataPath: vi.fn((basePath: string) => path.join(basePath, '.rollipop')),
  getSharedDataPath: (basePath: string) => path.join(basePath, '.rollipop'),
}));

function resetSingleton() {
  // Reset static instance for test isolation
  (FileStorage as any).instance = null;
}

describe('FileStorage', () => {
  const basePath = '/tmp/rollipop-test';
  const dataFilePath = path.join(basePath, '.rollipop', 'rollipop.json');

  beforeEach(() => {
    resetSingleton();
    vi.mocked(ensureSharedDataPath).mockClear();
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return the same instance across multiple calls', () => {
      const instance1 = FileStorage.getInstance(basePath);
      const instance2 = FileStorage.getInstance(basePath);

      expect(instance1).toBe(instance2);
    });

    it('should return default data when file does not exist', () => {
      const instance = FileStorage.getInstance(basePath);

      expect(instance.get()).toEqual({ build: {} });
    });

    it('should ensure the storage directory exists', () => {
      FileStorage.getInstance(basePath);

      expect(ensureSharedDataPath).toHaveBeenCalledWith(basePath);
    });

    it('should load existing data from file', () => {
      const existingData: FileStorageData = {
        build: { abc123: { totalModules: 42 } },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingData));

      const instance = FileStorage.getInstance(basePath);

      expect(fs.readFileSync).toHaveBeenCalledWith(dataFilePath, 'utf-8');
      expect(instance.get()).toEqual(existingData);
    });
  });

  describe('set', () => {
    it('should merge data and write to file', () => {
      const instance = FileStorage.getInstance(basePath);

      instance.set({ build: { hash1: { totalModules: 10 } } });

      expect(instance.get().build).toEqual({ hash1: { totalModules: 10 } });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        dataFilePath,
        JSON.stringify({ build: { hash1: { totalModules: 10 } } }, null, 2),
      );
    });

    it('should deep merge with existing data', () => {
      const instance = FileStorage.getInstance(basePath);

      instance.set({ build: { hash1: { totalModules: 10 } } });
      instance.set({ build: { hash2: { totalModules: 20 } } });

      expect(instance.get().build).toEqual({
        hash1: { totalModules: 10 },
        hash2: { totalModules: 20 },
      });
    });

    it('should persist mutations visible to the same instance', () => {
      const instance1 = FileStorage.getInstance(basePath);
      instance1.set({ build: { hash1: { totalModules: 5 } } });

      const instance2 = FileStorage.getInstance(basePath);
      expect(instance2.get().build.hash1).toEqual({ totalModules: 5 });
    });
  });
});
