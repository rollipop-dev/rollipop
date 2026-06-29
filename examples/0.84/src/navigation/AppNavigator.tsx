import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useReactNavigationDevTools } from '@rozenite/react-navigation-plugin';
import { useRef } from 'react';

import { DetailsScreen } from '../screens/DetailsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null!);

  useReactNavigationDevTools({ ref: navigationRef });

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator
        initialRouteName="home"
        screenOptions={{
          headerTitle: '',
        }}
      >
        <RootStack.Screen name="home" component={HomeScreen} options={{ headerShown: false }} />
        <RootStack.Screen name="details" component={DetailsScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
