import fs from 'node:fs';
import path from 'node:path';

import { merge } from 'es-toolkit';

import { ROLLIPOP_VERSION } from '../constants';

const STORAGE_DIRECTORY_NAME = '.rollipop';
const DATA_FILENAME = 'rollipop.json';

function createDefaultData(): FileStorageData {
  return {
    version: ROLLIPOP_VERSION,
    build: {},
  };
}

export interface FileStorageData {
  version: string;
  build: {
    [buildHash: string]: {
      totalModules: number;
    };
  };
}

export class FileStorage {
  private static instance: FileStorage | null = null;
  private dataFilePath: string;
  private data: FileStorageData;

  static getPath(this: void, basePath: string, { prepare = false }: { prepare?: boolean } = {}) {
    const storagePath = path.join(basePath, STORAGE_DIRECTORY_NAME);

    if (prepare && !fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    return storagePath;
  }

  static getInstance(basePath: string) {
    if (FileStorage.instance == null) {
      FileStorage.instance = new FileStorage(basePath);
    }
    return FileStorage.instance;
  }

  private constructor(basePath: string) {
    this.dataFilePath = path.join(FileStorage.getPath(basePath, { prepare: true }), DATA_FILENAME);

    if (fs.existsSync(this.dataFilePath)) {
      const loadedData = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'));

      if ('version' in loadedData && loadedData.version === ROLLIPOP_VERSION) {
        this.data = loadedData;
      } else {
        this.data = createDefaultData();
        this.flush();
      }
    } else {
      this.data = createDefaultData();
    }
  }

  get() {
    return this.data;
  }

  set(data: Partial<FileStorageData>) {
    this.data = merge(this.data, data);
  }

  flush() {
    fs.writeFileSync(this.dataFilePath, JSON.stringify(this.data, null, 2));
  }
}
