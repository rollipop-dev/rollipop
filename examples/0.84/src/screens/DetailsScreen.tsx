import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { Section } from '../components/Section';
import { type CheckStatus, StatusPill } from '../components/StatusPill';
import { colors, radius, spacing } from '../theme';
import {
  runRuntimeChecks,
  runtimeChecks,
  summarizeReports,
  type RuntimeCheckDefinition,
  type RuntimeCheckReport,
} from '../utils/runtimeChecks';

type RuntimeCheckRow = RuntimeCheckDefinition & {
  durationMs?: number;
  message?: string;
  status: CheckStatus;
};

function toIdleRows(): RuntimeCheckRow[] {
  return runtimeChecks.map((check) => ({
    ...check,
    status: 'idle',
  }));
}

function toReportRow(report: RuntimeCheckReport): RuntimeCheckRow {
  return {
    ...report,
    status: report.status,
  };
}

export function DetailsScreen() {
  const [rows, setRows] = useState<RuntimeCheckRow[]>(toIdleRows);
  const [running, setRunning] = useState(false);

  const summary = useMemo(() => {
    const reports = rows.filter((row): row is RuntimeCheckReport => {
      return row.status === 'passed' || row.status === 'failed';
    });

    return summarizeReports(reports);
  }, [rows]);

  const handleRunAll = useCallback(async () => {
    setRunning(true);
    setRows((currentRows) =>
      currentRows.map((row) => ({
        ...row,
        message: undefined,
        status: 'running',
      })),
    );

    const reports = await runRuntimeChecks();

    setRows(reports.map(toReportRow));
    setRunning(false);
  }, []);

  const summaryText =
    summary.total === 0
      ? `${runtimeChecks.length} checks ready`
      : `${summary.passed}/${summary.total} checks passed`;

  return (
    <Screen
      footer={
        <AppButton
          disabled={running}
          label={running ? 'Running checks' : 'Run all checks'}
          onPress={handleRunAll}
          testID="run-all-checks-button"
        />
      }
      testID="test-suites-screen"
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>Test suites</Text>
        <Text style={styles.title}>Runtime checks</Text>
        <Text style={styles.description}>{summaryText}</Text>
      </View>

      <Section title="Checks">
        {rows.map((row) => (
          <View key={row.id} style={styles.checkRow}>
            <View style={styles.checkCopy}>
              <Text style={styles.checkGroup}>{row.group}</Text>
              <Text style={styles.checkTitle}>{row.title}</Text>
              <Text style={styles.checkExpectation}>{row.expectation}</Text>
              {row.message ? <Text style={styles.checkMessage}>{row.message}</Text> : null}
            </View>
            <View style={styles.checkStatus}>
              <StatusPill status={row.status} />
              {typeof row.durationMs === 'number' ? (
                <Text style={styles.duration}>{row.durationMs}ms</Text>
              ) : null}
            </View>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  checkExpectation: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  checkGroup: {
    color: colors.subtle,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  checkMessage: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  checkRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  checkStatus: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  checkTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  duration: {
    color: colors.subtle,
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    gap: spacing.sm,
  },
  kicker: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '800',
  },
});
