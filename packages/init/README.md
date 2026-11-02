# @rollipop/init

Run from a React Native or Expo project root:

```bash
yarn dlx @rollipop/init@beta
yarn install
```

- Bare projects: logs `bare project detected`, adds the matching `rollipop` version, and configures `react-native.config.js` and `ios/.xcode.env` for Xcode bundle builds. The Xcode setup resolves local or hoisted `node_modules` without running Node before `.xcode.env.local` loads, preserves existing Node settings, and reports custom `CLI_PATH` configurations for manual setup. Projects without `ios` are skipped.
- Expo projects: logs `expo project detected`, adds matching `rollipop` and `@rollipop/expo` versions, and registers the config plugin in `app.json` or `app.config.json` while preserving existing plugins. Dynamic JS/TS configuration is left unchanged with manual setup instructions.

Expo detection uses the `expo` dependency in `package.json`, including prebuilt projects with native directories. See [Quick Start](https://rollipop.dev/docs/get-started/quick-start) or the [Expo guide](https://rollipop.dev/docs/experimental/expo) for setup and limitations.
