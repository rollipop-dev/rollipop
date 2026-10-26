# React Native 0.72 example

Install dependencies and build packages from the repository root:

```bash
yarn install
yarn build:all
cd examples/0.72
```

Uses `runtimeTarget: 'hermes'` and a custom HMR client for React Native 0.72.

Start the Rollipop dev server:

```bash
yarn start
```

For iOS, install Ruby and CocoaPods dependencies before the first build:

```bash
bundle install
yarn pod:install
```

In a separate terminal, run `yarn ios` or `yarn android` from this directory.

See [Rollipop documentation](https://rollipop.dev) for configuration and diagnostics.
