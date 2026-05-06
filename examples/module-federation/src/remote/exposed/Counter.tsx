import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Remote Counter</Text>
      <Text style={styles.count}>{count}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={() => setCount((value) => value - 1)}>
          <Text style={styles.buttonText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setCount((value) => value + 1)}>
          <Text style={styles.buttonText}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Loaded via Module Federation</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  label: { fontSize: 16, fontWeight: '600' },
  count: { fontSize: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 16 },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0070f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  hint: { fontSize: 12, color: '#999', marginTop: 8 },
});
