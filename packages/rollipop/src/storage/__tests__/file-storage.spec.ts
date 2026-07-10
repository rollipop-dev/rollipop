import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { FileStorage, type FileStorageData } from '../file-storage';

function resetSingleton() {
  // Reset static instance for test isolation
  (FileStorage as any).instance = null;
}

describe('FileStorage', () => {
  const basePath = '/tmp/rollipop-test';
  const dataFilePath = path.join(basePath, '.rollipop', 'rollipop.json');
  let getPathSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetSingleton();
    getPathSpy = vi.spyOn(FileStorage, 'getPath').mockReturnValue(path.join(basePath, '.rollipop'));
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

      expect(instance.get()).toEqual({ version: globalThis.__ROLLIPOP_VERSION__, build: {} });
    });

    it('should ensure the storage directory exists', () => {
      FileStorage.getInstance(basePath);

      expect(getPathSpy).toHaveBeenCalledWith(basePath, { prepare: true });
    });

    it('should load existing data from file', () => {
      const existingData: FileStorageData = {
        version: globalThis.__ROLLIPOP_VERSION__,
        build: { abc123: { totalModules: 42 } },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingData));

      const instance = FileStorage.getInstance(basePath);

      expect(fs.readFileSync).toHaveBeenCalledWith(dataFilePath, 'utf-8');
      expect(instance.get()).toEqual(existingData);
    });

    it('should reset stale data when stored version does not match', () => {
      const existingData: FileStorageData = {
        version: '0.0.0-stale',
        build: { abc123: { totalModules: 42 } },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingData));

      const instance = FileStorage.getInstance(basePath);

      expect(instance.get()).toEqual({ version: globalThis.__ROLLIPOP_VERSION__, build: {} });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        dataFilePath,
        JSON.stringify({ version: globalThis.__ROLLIPOP_VERSION__, build: {} }, null, 2),
      );
    });
  });

  describe('set', () => {
    it('should merge data without writing to file', () => {
      const instance = FileStorage.getInstance(basePath);

      instance.set({ build: { hash1: { totalModules: 10 } } });

      expect(instance.get().build).toEqual({ hash1: { totalModules: 10 } });
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should write data when flushed', () => {
      const instance = FileStorage.getInstance(basePath);

      instance.set({ build: { hash1: { totalModules: 10 } } });
      instance.flush();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        dataFilePath,
        JSON.stringify(
          { version: globalThis.__ROLLIPOP_VERSION__, build: { hash1: { totalModules: 10 } } },
          null,
          2,
        ),
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
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should persist mutations visible to the same instance', () => {
      const instance1 = FileStorage.getInstance(basePath);
      instance1.set({ build: { hash1: { totalModules: 5 } } });

      const instance2 = FileStorage.getInstance(basePath);
      expect(instance2.get().build.hash1).toEqual({ totalModules: 5 });
    });
  });
});
