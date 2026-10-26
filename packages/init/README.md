# @rollipop/init

Run from a React Native or Expo project root:

```bash
yarn dlx @rollipop/init@beta
yarn install
```

- Bare projects: logs `bare project detected`, adds the matching `rollipop` version, and configures `react-native.config.js`.
- Expo projects: logs `expo project detected`, adds matching `rollipop` and `@rollipop/expo` versions, and registers the config plugin in `app.json` or `app.config.json` while preserving existing plugins. Dynamic JS/TS configuration is left unchanged with manual setup instructions.

Expo detection uses the `expo` dependency in `package.json`, including prebuilt projects with native directories. See [Quick Start](https://rollipop.dev/docs/get-started/quick-start) or the [Expo guide](https://rollipop.dev/docs/experimental/expo) for setup and limitations.
