import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

export type CheckStatus = 'failed' | 'idle' | 'passed' | 'running';

type StatusPillProps = {
  status: CheckStatus;
};

const labels: Record<CheckStatus, string> = {
  failed: 'Fail',
  idle: 'Idle',
  passed: 'Pass',
  running: 'Run',
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <View style={[styles.pill, styles[status]]}>
      <Text style={[styles.label, styles[`${status}Label`]]}>{labels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  failed: {
    backgroundColor: '#FEF3F2',
  },
  failedLabel: {
    color: colors.red,
  },
  idle: {
    backgroundColor: colors.surfaceAlt,
  },
  idleLabel: {
    color: colors.primaryDark,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
  },
  passed: {
    backgroundColor: '#ECFDF3',
  },
  passedLabel: {
    color: colors.green,
  },
  pill: {
    alignItems: 'center',
    borderRadius: radius.sm,
    minWidth: 54,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  running: {
    backgroundColor: '#FFFAEB',
  },
  runningLabel: {
    color: colors.amber,
  },
});
