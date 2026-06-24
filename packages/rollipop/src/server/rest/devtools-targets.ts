export interface DevToolsTarget {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  devtoolsFrontendUrl?: string;
  webSocketDebuggerUrl?: string;
  [key: string]: unknown;
}

export async function fetchDevToolsTargets(serverBaseUrl: string): Promise<DevToolsTarget[]> {
  try {
    const response = await fetch(new URL('/json/list', serverBaseUrl), {
      method: 'POST',
      signal: AbortSignal.timeout(1000),
    });

    if (!response.ok) {
      return [];
    }

    const targets = (await response.json()) as unknown;

    if (!Array.isArray(targets)) {
      return [];
    }

    return targets.filter((target): target is DevToolsTarget => {
      return target != null && typeof target === 'object' && !Array.isArray(target);
    });
  } catch {
    return [];
  }
}

export function getDevToolsTargetId(target: DevToolsTarget, index: number): string {
  return (
    getString(target.id) ??
    getString(target.webSocketDebuggerUrl) ??
    getString(target.devtoolsFrontendUrl) ??
    `target-${index + 1}`
  );
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
