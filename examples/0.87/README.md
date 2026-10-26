# React Native 0.87 example

Install dependencies and build packages from the repository root:

```bash
yarn install
yarn build:all
cd examples/0.87
```

Uses `runtimeTarget: 'hermes-v1'`. React Native CLI commands are registered through `react-native.config.js`.

Start the Rollipop dev server:

```bash
yarn start
```

For iOS, install Ruby and CocoaPods dependencies before the first build:

```bash
bundle install
cd ios
bundle exec pod install
cd ..
```

In a separate terminal, run `yarn ios` or `yarn android` from this directory.

See [Rollipop documentation](https://rollipop.dev) for configuration and diagnostics.
