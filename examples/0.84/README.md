# React Native 0.84 example

Install dependencies and build packages from the repository root:

```bash
yarn install
yarn build:all
cd examples/0.84
```

Exercises React Compiler, worklets, SVG imports, bundle analysis, custom commands, and a Devframe dock. Run `yarn devtools:build` before `yarn start`. Set `WITH_ROZENITE=true` to enable Rozenite.

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
