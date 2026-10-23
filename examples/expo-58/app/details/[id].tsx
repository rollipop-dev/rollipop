import { Link, useLocalSearchParams, usePathname } from 'expo-router';
import { Text, View } from 'react-native';

export default function Details() {
  const { id, source } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Text style={{ fontSize: 24 }}>Details {id}</Text>
      <Text testID="detail-id">Route ID: {id}</Text>
      <Text testID="detail-source">Source: {source}</Text>
      <Text testID="detail-path">Path: {usePathname()}</Text>
      <Link href="/" style={{ color: '#3659d9', fontSize: 18 }}>
        Back home
      </Link>
    </View>
  );
}
