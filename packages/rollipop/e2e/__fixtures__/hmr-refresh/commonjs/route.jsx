const { Text } = require('react-native');

globalThis.executions.route++;

function createRoute(options) {
  return options;
}

const Router = createRoute({ component: Component });

function Component() {
  return <Text>Hello, world!</Text>;
}

module.exports = { Router };
