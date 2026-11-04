import { routes } from './registry';

globalThis.executions.app++;

export function App() {
  const Component = routes[0].component;
  return <Component />;
}
