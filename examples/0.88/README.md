# React Native 0.88

React Native 0.88.0 / React 19.3.0 demo, using Rollipop and Hermes V1. The native projects come from the official 0.88 community template, including the iOS SceneDelegate lifecycle.

From the repository root:

```sh
yarn install --immutable
yarn build:all
```

From this directory:

```sh
yarn start
```

In another terminal, run `yarn ios` or `yarn android`. For the first iOS build, run `bundle install` and `cd ios && bundle exec pod install` first.

`react-native.config.js` registers Rollipop's commands with the React Native CLI. Runtime initialization uses `react-native/setup-env` before the app entry; older React Native examples retain their own runtime strategy.

The counter checks native event dispatch. Editing its surrounding text while the counter is incremented also makes Fast Refresh state preservation easy to verify.
