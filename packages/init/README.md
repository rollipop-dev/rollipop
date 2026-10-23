# @rollipop/init

Run `npx @rollipop/init@beta` from your React Native or Expo project root, then install the updated dependencies with your package manager.

- Bare projects: logs `bare project detected`, adds the matching `rollipop` version, and configures `react-native.config.js`.
- Expo projects: logs `expo project detected`, adds the matching `@rollipop/expo` version, and registers the config plugin in `app.json` or `app.config.json` while preserving existing plugins. Dynamic JS/TS configuration is left unchanged with manual setup instructions.

Expo detection uses the `expo` dependency in `package.json`, including prebuilt projects with native directories. See the [Expo guide](https://rollipop.dev/docs/experimental/expo) for supported versions, setup, and limitations.
