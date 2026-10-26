# @rollipop/plugin-rozenite

## Usage

```ts
import { rozenite } from '@rollipop/plugin-rozenite';
import { defineConfig } from 'rollipop';

export default defineConfig({
  plugins: [rozenite({ enabled: true })],
});
```

`enabled` defaults to `false`. Accepts `@rozenite/middleware` options except `projectRoot` and `projectType`, which are set automatically. Available only in the dev server.

See [Rozenite](https://rollipop.dev/docs/features/rozenite) for installation and options.
