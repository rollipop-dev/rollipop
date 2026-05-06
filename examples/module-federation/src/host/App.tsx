import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/** Federation container name, as declared in `rollipop.host.config.ts`. */
const REMOTE_NAME = 'remote_app';

const RemoteCounter = React.lazy(() => {
  return import('remote_app/Counter').then((mod) => ({ default: mod.default }));
});

/**
 * Snapshot of the Module Federation runtime state, read from the globals the
 * federation plugin installs. Re-evaluated every second so the panel reflects
 * the remote being loaded at runtime.
 */
function useRuntimeSnapshot() {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceRender((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const g = globalThis as any;
  const cache = g.__rollipop_module_federation_cache__;
  return {
    scriptLoader: g.__rollipop_script_loader__ != null,
    shared: Object.keys(g.__rollipop_shared__ ?? {}),
    containerRegistered: g[REMOTE_NAME] != null,
    loadedRemotes: cache ? Object.keys(cache.modules) : [],
    pending: cache ? Object.keys(cache.pending).length : 0,
    invalidated: cache ? cache.invalidatedIds.size : 0,
    subscribers: cache ? cache.subscribers.size : 0,
  };
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function DebugPanel() {
  const snap = useRuntimeSnapshot();
  return (
    <View style={styles.debug}>
      <Text style={styles.debugTitle}>MF RUNTIME</Text>
      <DebugRow label="Script loader" value={snap.scriptLoader ? '✓ registered' : '— missing'} />
      <DebugRow
        label={`Container "${REMOTE_NAME}"`}
        value={snap.containerRegistered ? '✓ registered' : '— not loaded'}
      />
      <DebugRow label="Shared deps" value={snap.shared.join(', ') || '—'} />
      <DebugRow label="Loaded remotes" value={snap.loadedRemotes.join(', ') || '—'} />
      <DebugRow label="Pending / invalidated" value={`${snap.pending} / ${snap.invalidated}`} />
      <DebugRow label="HMR subscribers" value={String(snap.subscribers)} />
    </View>
  );
}

function RemoteFallback() {
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="large" />
      <Text style={styles.fallbackText}>Loading remote bundle…</Text>
    </View>
  );
}

export function App() {
  const [showRemote, setShowRemote] = useState(false);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Host App</Text>
      <Text style={styles.subtitle}>Module Federation example</Text>

      <DebugPanel />

      <TouchableOpacity style={styles.button} onPress={() => setShowRemote((v) => !v)}>
        <Text style={styles.buttonText}>
          {showRemote ? 'Unmount remote component' : 'Render remote component'}
        </Text>
      </TouchableOpacity>

      <View style={styles.remoteArea}>
        {showRemote ? (
          <Suspense fallback={<RemoteFallback />}>
            <RemoteCounter />
          </Suspense>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Remote component not mounted</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, paddingTop: 64, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#666' },
  debug: { backgroundColor: '#111', borderRadius: 10, padding: 12, gap: 6 },
  debugTitle: { color: '#3ddc84', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowLabel: { color: '#888', fontSize: 11, width: 140 },
  rowValue: { color: '#eee', fontSize: 11, flex: 1 },
  button: {
    backgroundColor: '#0070f3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  remoteArea: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#999', fontSize: 13 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  fallbackText: { fontSize: 14, color: '#666' },
});
