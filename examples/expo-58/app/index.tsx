import { Link, usePathname } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import AnimatedProbe from '../components/AnimatedProbe';
import CompilerProbe from '../components/CompilerProbe';

export default function Home() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  const runtime = globalThis as typeof globalThis & {
    __rollipop_meta__?: unknown;
    HermesInternal?: unknown;
  };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rollipop Expo Router ready</Text>
      <Text testID="bundler-engine">
        Engine: {runtime.__rollipop_meta__ ? 'Rollipop' : 'unknown'}
      </Text>
      <Text testID="js-runtime">Runtime: {runtime.HermesInternal ? 'Hermes' : 'unknown'}</Text>
      <Text testID="router-path">Path: {pathname}</Text>
      <Text>router-home-initial</Text>
      <Image source={require('../assets/pixel.png')} style={{ width: 32, height: 32 }} />
      <Pressable testID="counter" accessibilityRole="button" onPress={() => setCount(count + 1)}>
        <Text style={styles.action}>Counter: {count}</Text>
      </Pressable>
      <Link testID="open-details" href="/details/42?source=home" style={styles.action}>
        Open details 42
      </Link>
      <Link testID="open-settings" href="/settings" style={styles.action}>
        Open grouped settings
      </Link>
      <AnimatedProbe />
      <CompilerProbe value={21} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  title: { fontSize: 22, fontWeight: '600' },
  action: { color: '#3659d9', fontSize: 18, padding: 8 },
});
