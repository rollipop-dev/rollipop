import { Text } from 'react-native';

globalThis.executions.route++;

function createRoute(options) {
  return options;
}

export const Router = createRoute({ component: Component });

function Component() {
  return <Text>Hello, world!</Text>;
}
