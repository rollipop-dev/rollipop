import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useReactNavigationDevTools } from '@rozenite/react-navigation-plugin';
import { useRef } from 'react';

import type { RootStackParamList } from './types';

interface Screen {
  path: string;
  component: React.ComponentType<unknown>;
}

const RootStack = createNativeStackNavigator<RootStackParamList>();

const pages = import.meta.glob('../pages/*', { import: 'default', eager: true });
const screens = Object.entries(pages).map(([path, module]) => {
  return {
    path: parseScreenPath(path),
    component: module,
  } as Screen;
});

function parseScreenPath(path: string) {
  return path.split('/').pop()?.split('.').shift();
}

export function AppNavigator() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null!);

  useReactNavigationDevTools({ ref: navigationRef });

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator
        initialRouteName="index"
        screenOptions={(props) => ({
          headerShown: props.route.name !== 'index',
          headerTitle: '',
        })}
      >
        {screens.map((screen) => (
          <RootStack.Screen
            key={screen.path}
            name={screen.path as keyof RootStackParamList}
            component={screen.component}
          />
        ))}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
