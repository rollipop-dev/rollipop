# @rollipop/plugin-rozenite

## Usage

```ts
import { rozenite } from '@rollipop/plugin-rozenite';
import { defineConfig } from 'rollipop';

export default defineConfig({
  plugins: [rozenite({ enabled: true })],
});
```

`enabled` defaults to `false`. Other middleware options are forwarded, except `projectRoot` and `projectType`, which Rollipop supplies. Runs only during dev-server setup.

See [Rozenite](https://rollipop.dev/docs/features/rozenite) for installation and options.
