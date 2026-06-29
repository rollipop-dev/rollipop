import { render } from '@testing-library/react-native';
import React from 'react';
import {
  AppState,
  Dimensions,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { App } from '../App';

describe('rollipop/jest-preset — RN integration', () => {
  it('renders correctly', async () => {
    const instance = render(<App />);
    expect(instance.getByText('Rollipop')).toBeTruthy();
    expect(instance.getByText('Modern build toolkit for React Native')).toBeTruthy();
    expect(instance.getByText('Get Started')).toBeTruthy();
  });

  it('exposes Platform.OS and Platform.constants via jest-preset NativeModules', () => {
    expect(Platform.OS).toBe('ios');
    expect(Platform.constants).toBeDefined();
    expect(Platform.select({ ios: 'yes', default: 'no' })).toBe('yes');
  });

  it('returns non-zero Dimensions from the NativeModules.DeviceInfo mock', () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    expect(window.width).toBeGreaterThan(0);
    expect(window.height).toBeGreaterThan(0);
    expect(screen.width).toBeGreaterThan(0);
    expect(screen.height).toBeGreaterThan(0);
  });

  it('records StyleSheet.create entries', () => {
    const styles = StyleSheet.create({
      container: { flex: 1, alignItems: 'center' },
      title: { fontSize: 24 },
    });
    expect(styles.container).toBeDefined();
    expect(styles.title).toBeDefined();
  });

  it('routes NativeModules.AlertManager.alertWithArgs through a jest.fn spy', () => {
    const alert = NativeModules.AlertManager.alertWithArgs;
    expect(typeof alert).toBe('function');
    alert({ message: 'hi' });
    expect(alert).toHaveBeenCalledWith({ message: 'hi' });
  });

  it('AppState.addEventListener hands back a subscription with remove()', () => {
    const handler = jest.fn();
    const sub = AppState.addEventListener('change', handler);
    expect(typeof sub.remove).toBe('function');
  });

  it('rewrites import.meta.hot to undefined so HMR blocks become dead code', () => {
    expect(import.meta.hot).toBeUndefined();
  });

  it('renders a RN primitive tree through @testing-library/react-native', async () => {
    const Greeting = () => (
      <View>
        <Text>hello from rollipop/jest</Text>
      </View>
    );

    const instance = render(<Greeting />);
    expect(instance).not.toBeNull();
    const tree = instance.toJSON();
    expect(tree).toBeTruthy();
  });
});
