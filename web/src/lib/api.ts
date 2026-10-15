import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Alert, Cycle, Device, Line, ServerMessage, Station, StationLive } from '@shared/types.ts';
import type { LineMetrics } from '@shared/analytics.ts';

export type { Alert, Cycle, Device, Line, Station, StationLive, LineMetrics };

export interface LineView { line: Line; stations: Station[]; metrics: LineMetrics; live: (StationLive | null)[] }
export interface PlantView {
  plant: { id: string; name: string; company: string };
  shiftStart: number;
  now: number;
  lines: LineView[];
  devices: Device[];
  openAlerts: number;
}

// Standalone build (e.g. Vercel, no backend): the same plant runtime the Node server uses runs in-page.
export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';
let runtime: Promise<import('@shared/runtime.ts').PlantRuntime> | null = null;
function getRuntime() {
  runtime ??= import('@shared/runtime.ts').then(({ PlantRuntime, MemoryStore }) => {
    const rt = new PlantRuntime(new MemoryStore(), {
      readReport: async () => { const r = await fetch('/trt_report.json'); if (!r.ok) throw new Error('none'); return r.json(); },
    });
    rt.subscribe(m => realtime.dispatch(m));
    rt.start();
    return rt;
  });
  return runtime;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (STANDALONE) {
    const rt = await getRuntime();
    const u = new URL(path, location.origin);
    const r = await rt.handle(init?.method ?? 'GET', u.pathname, u.searchParams, init?.body ? JSON.parse(String(init.body)) : undefined);
    if (r.status >= 400) throw new Error(`${r.status} ${JSON.stringify(r.body)}`);
    return structuredClone(r.body) as T; // detach from runtime state, like a network response would
  }
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** Fetch + refresh on an interval and whenever a matching realtime event arrives. */
export function useResource<T>(path: string | null, opts: { every?: number; on?: ServerMessage['kind'][] } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!path) return;
    api<T>(path).then(d => { setData(d); setError(null); }).catch(e => setError(String(e)));
  }, [path]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => {
    if (!opts.every) return;
    const t = setInterval(load, opts.every); return () => clearInterval(t);
  }, [load, opts.every]);
  const kinds = (opts.on ?? []).join(',');
  useEffect(() => {
    if (!kinds) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    return realtime.subscribe(m => {
      if (!kinds.includes(m.kind) || pending) return;
      pending = setTimeout(() => { pending = null; load(); }, 400);
    });
  }, [kinds, load]);
  return { data, error, reload: load };
}

// ---------------------------------------------------------------- realtime (single shared socket)
type Listener = (m: ServerMessage) => void;
const realtime = (() => {
  const listeners = new Set<Listener>();
  const live = new Map<string, StationLive>();
  let ws: WebSocket | null = null, connected = false, version = 0;
  const notify = () => { version++; snapshotListeners.forEach(f => f()); };
  const snapshotListeners = new Set<() => void>();
  function dispatch(m: ServerMessage) {
    if (m.kind === 'live') { live.set(m.live.stationId, m.live); notify(); }
    listeners.forEach(l => l(m));
  }
  function connect() {
    if (STANDALONE) { connected = true; void getRuntime().then(notify); return; }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { connected = true; notify(); };
    ws.onclose = () => { connected = false; notify(); setTimeout(connect, 1500); };
    ws.onmessage = e => dispatch(JSON.parse(e.data) as ServerMessage);
  }
  if (typeof window !== 'undefined') queueMicrotask(connect);
  return {
    dispatch,
    subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
    subscribeSnapshot(f: () => void) { snapshotListeners.add(f); return () => { snapshotListeners.delete(f); }; },
    get version() { return version; },
    get connected() { return connected; },
    live,
  };
})();

export function useRealtime(handler: Listener) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => realtime.subscribe(m => ref.current(m)), []);
}

/** Live station states (phase, status, current-cycle start) pushed every second. */
export function useLiveStations() {
  useSyncExternalStore(realtime.subscribeSnapshot, () => realtime.version);
  return { live: realtime.live, connected: realtime.connected };
}

/** Re-render every `ms` to animate elapsed timers. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
