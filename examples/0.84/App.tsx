import { AppNavigator } from './src/navigation/AppNavigator';

export function App() {
  return <AppNavigator />;
}

if (import.meta.hot) {
  import.meta.hot.on('custom-server-event', (data) => {
    console.log('Received custom server event:', data);
  });
}
