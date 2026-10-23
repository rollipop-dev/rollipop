import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function Settings() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Text style={{ fontSize: 24 }}>Grouped settings route</Text>
      <Link href="/">Back home</Link>
    </View>
  );
}
