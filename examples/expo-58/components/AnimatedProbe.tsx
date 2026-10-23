import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { isWorkletFunction, runOnUI, scheduleOnRN } from 'react-native-worklets';

type WorkletProof = { transformed: boolean; result: number; onUI: boolean };

export default function AnimatedProbe() {
  const progress = useSharedValue(0);
  const [proof, setProof] = useState<WorkletProof | null>(null);
  const report = useCallback((result: number, onUI: boolean) => {
    const value = { transformed: true, result, onUI };
    (
      globalThis as typeof globalThis & { __rollipop_worklets_probe__?: WorkletProof }
    ).__rollipop_worklets_probe__ = value;
    setProof(value);
  }, []);
  const capturedOffset = 40;
  const verifyOnUI = () => {
    'worklet';
    const onUI = !!(globalThis as typeof globalThis & { _WORKLET?: boolean })._WORKLET;
    scheduleOnRN(report, capturedOffset + 2, onUI);
  };
  const transformed = isWorkletFunction(verifyOnUI);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value }],
  }));
  useEffect(() => {
    runOnUI(verifyOnUI)();
  }, []);

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Text testID="worklet-result">
        Worklet UI result: {proof?.onUI ? proof.result : 'waiting'}
      </Text>
      <Text testID="worklet-serialization">Serialized worklet: {transformed ? 'yes' : 'no'}</Text>
      <View style={{ width: 120, height: 24 }}>
        <Animated.View
          testID="animated-box"
          style={[
            { width: 24, height: 24, borderRadius: 6, backgroundColor: '#3659d9' },
            animatedStyle,
          ]}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        testID="animate-worklet"
        onPress={() => {
          progress.value = withTiming(progress.value === 0 ? 80 : 0, { duration: 400 });
          runOnUI(verifyOnUI)();
        }}
      >
        <Text style={{ color: '#3659d9', padding: 8 }}>Animate on UI thread</Text>
      </Pressable>
    </View>
  );
}
