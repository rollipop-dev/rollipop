import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { type CSSAnimationKeyframes } from 'react-native-reanimated';

import Logo from '../../logo.svg';
import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';
import { appDescription } from '../utils/env';

const breathe: CSSAnimationKeyframes = {
  to: {
    transform: [{ scale: 1.06 }],
  },
};

type HomeNavigation = NativeStackNavigationProp<RootStackParamList, 'home'>;

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const { width } = useWindowDimensions();
  const logoSize = Math.min(180, Math.max(124, width * 0.42));

  return (
    <Screen
      contentContainerStyle={styles.content}
      footer={
        <AppButton
          label="Get Started"
          onPress={() => navigation.navigate('details')}
          testID="get-started-button"
        />
      }
      scrollEnabled={false}
      testID="home-screen"
    >
      <View style={styles.hero}>
        <Animated.View
          animatedProps={{
            animationDirection: 'alternate',
            animationDuration: 1400,
            animationIterationCount: 'infinite',
            animationName: breathe,
            animationTimingFunction: 'ease-in-out',
          }}
        >
          <Logo height={logoSize} width={logoSize} />
        </Animated.View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>Rollipop</Text>
          <Text style={styles.description}>{appDescription}</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  heroCopy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.primary,
    fontSize: 40,
    fontWeight: '700',
  },
});
