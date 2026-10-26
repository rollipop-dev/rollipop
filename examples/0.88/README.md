# React Native 0.88

React Native 0.88.0 / React 19.3.0 demo, using Rollipop and Hermes V1.

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

`react-native.config.js` registers Rollipop's commands with the React Native CLI.

To check Fast Refresh, increment the counter and edit its surrounding text. The count should be preserved.
