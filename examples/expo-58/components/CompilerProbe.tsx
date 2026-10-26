import { Text } from 'react-native';

export default function CompilerProbe({ value }: { value: number }) {
  const doubled = value * 2;
  return <Text testID="react-compiler-result">Compiler doubled: {doubled}</Text>;
}
