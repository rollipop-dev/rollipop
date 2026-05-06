/// <reference types="rollipop/client" />

interface ImportMetaEnv {
  readonly ROLLIPOP_DESCRIPTION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
