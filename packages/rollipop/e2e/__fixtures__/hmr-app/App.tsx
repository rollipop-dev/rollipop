import React from 'react';
import { Text, View } from 'react-native';

export function App() {
  const mode = import.meta.env.MODE;

  return (
    <View>
      <Text>Hello from Rollipop</Text>
      <Text>{mode}</Text>
    </View>
  );
}
