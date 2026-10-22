/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { NewAppScreen } from '@react-native/new-app-screen';
import { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <View style={[styles.probe, { paddingTop: safeAreaInsets.top }]}>
        <Text testID="rn-version">React Native 0.88 · Rollipop</Text>
        <Pressable accessibilityRole="button" testID="counter" onPress={() => setCount(count + 1)}>
          <Text>Counter: {count}</Text>
        </Pressable>
      </View>
      <NewAppScreen templateFileName="App.tsx" safeAreaInsets={safeAreaInsets} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  probe: {
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
});

export default App;
