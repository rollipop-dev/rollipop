import type { FileStorage } from '../storage/file-storage';

export function getBuildTotalModules(storage: FileStorage, id: string) {
  return storage.get().build[id]?.totalModules ?? 0;
}

export function setBuildTotalModules(storage: FileStorage, id: string, totalModules: number) {
  storage.set({
    build: {
      [id]: { totalModules },
    },
  });
  storage.flush();
}
