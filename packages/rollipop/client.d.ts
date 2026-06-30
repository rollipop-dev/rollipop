interface ImportMetaEnv {
  readonly MODE: 'development' | 'production';
  readonly BASE_URL?: string;
}

interface ImportMeta {
  glob: import('./import-glob').ImportGlobFunction;
  env: ImportMetaEnv;
  /**
   * Only available in development mode.
   */
  hot?: import('./dist').HMRContext;
}
