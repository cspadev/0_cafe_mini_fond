import type { InitParams } from './model/init';
import type { Comparison, RunReport } from './model/telemetry';

const TIMEOUT_MS = 10_000;

/** POSTs JSON to the statistics API. Any failure (no API, offline, an error answer) is just `null`: statistics never get in the way of the game. */
async function post<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface Run {
  /** Sends the finished game (once, later calls get the same answer) and resolves to the comparison, null when there is none. */
  submit: (report: RunReport) => Promise<Comparison | null>;
}

/** Asks the server for the token of a new game right away, so that it is ready when the game ends. */
export function createRun(init: InitParams): Run {
  const token = post<{ token: string }>('/api/start', init).then((r) => r?.token ?? null);
  let sent: Promise<Comparison | null> | null = null;
  return {
    submit: (report) =>
      (sent ??= token
        .then((t) => (t ? post<{ comparison: Comparison | null }>('/api/submit', { token: t, report }) : null))
        .then((r) => r?.comparison ?? null)),
  };
}
