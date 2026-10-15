// Takt plant runtime: simulator, ingest, live state and the full REST API as a pure request handler.
// The Node server wraps it with HTTP + WebSocket + SQLite; the browser "standalone" build (Vercel)
// runs the very same runtime in-page with an in-memory store.
import { CycleTracker } from './engine.ts';
import { histogram, lineMetrics } from './analytics.ts';
import { AlertRules } from './rules.ts';
import { LINES, PLANT, SIM_DEVICES, STATIONS } from './plant.ts';
import { driftAt, simCycle, simLive } from './sim.ts';
import type { Alert, Cycle, Device, KeypointFrame, Line, ServerMessage, Station, StationLive, Zones } from './types.ts';

export interface Store {
  saveCycles(cycles: { cycle: Cycle; lineId: string }[]): void;
  cyclesForLine(lineId: string, since: number): Cycle[];
  recentCycles(stationId: string, limit: number): Cycle[];
  deleteLineCycles(lineId: string): void;
  clearSim(): void;
  addAlert(a: Alert): void;
  listAlerts(limit: number): Alert[];
  ackAlert(id: string): void;
}

export interface ApiResult { status: number; body: unknown }

export class PlantRuntime {
  readonly lines: Line[] = LINES.map(l => ({ ...l }));
  readonly stations: (Station & { sim?: (typeof STATIONS)[number]['sim'] })[] = STATIONS.map(s => ({ ...s, zones: { ...s.zones } }));
  readonly shiftStart: number;
  private schedule: Cycle[] = [];
  private scheduled = new Map<string, Cycle[]>();
  private live = new Map<string, StationLive>();
  private devices = new Map<string, Device>(SIM_DEVICES.map(d => [d.id, { ...d }]));
  private trackers = new Map<string, CycleTracker>();
  private listeners = new Set<(m: ServerMessage) => void>();
  private rules: AlertRules;
  private timers: ReturnType<typeof setInterval>[] = [];
  private store: Store;
  private readReport: () => Promise<unknown>;

  constructor(store: Store, opts: { readReport?: () => Promise<unknown>; shiftAgeMin?: number } = {}) {
    this.store = store;
    this.readReport = opts.readReport ?? (async () => { throw new Error('no report'); });
    this.rules = new AlertRules(a => store.addAlert(a));
    this.shiftStart = Date.now() - (opts.shiftAgeMin ?? 5 * 60 + 40) * 60_000; // demo: shift B is already running
  }

  lineOf = (id: string) => this.lines.find(l => l.id === id);
  stationOf = (id: string) => this.stations.find(s => s.id === id);
  stationsOf = (lineId: string) => this.stations.filter(s => s.lineId === lineId).sort((a, b) => a.order - b.order);

  subscribe(fn: (m: ServerMessage) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(m: ServerMessage) { for (const l of this.listeners) l(m); }
  liveStates() { return [...this.live.values()]; }

  /** Backfill the shift and start the realtime clock. Sim lines are coupled flow lines: unit k can start
   *  at station i only after station i-1 finished it, so downstream stations starve behind the bottleneck. */
  start() {
    const now0 = Date.now(), horizon = now0 + 12 * 3_600_000;
    this.store.clearSim();
    const past: Cycle[] = [];
    for (const line of this.lines.filter(l => l.source === 'sim')) {
      const sts = this.stationsOf(line.id);
      const prevEnd = sts.map(() => this.shiftStart + Math.random() * 15_000);
      for (;;) {
        let upstream = this.shiftStart;
        for (let i = 0; i < sts.length; i++) {
          const start = Math.max(prevEnd[i], upstream) + 600; // 0.6s transfer
          const c = simCycle(sts[i].id, sts[i].sim!, start, driftAt(start));
          prevEnd[i] = upstream = c.end;
          if (c.end <= now0) past.push(c);
          else { this.schedule.push(c); const a = this.scheduled.get(c.stationId) ?? []; a.push(c); this.scheduled.set(c.stationId, a); }
        }
        if (upstream > horizon) break;
      }
    }
    past.sort((a, b) => a.end - b.end); this.schedule.sort((a, b) => a.end - b.end);
    this.store.saveCycles(past.map(c => ({ cycle: c, lineId: this.stationOf(c.stationId)!.lineId })));
    for (const c of past) { const st = this.stationOf(c.stationId)!; const line = this.lineOf(st.lineId)!; this.rules.evaluate(c, line, st, this.stationsOf(line.id)); }
    this.timers.push(setInterval(() => this.tick(), 1000));
    this.timers.push(setInterval(() => { for (const d of this.devices.values()) this.emit({ kind: 'device', device: d }); }, 3000));
    this.tick();
    return past.length;
  }

  stop() { this.timers.forEach(clearInterval); this.timers = []; }

  private commit(c: Cycle) {
    const st = this.stationOf(c.stationId); if (!st) return;
    const line = this.lineOf(st.lineId)!;
    this.store.saveCycles([{ cycle: c, lineId: line.id }]);
    this.emit({ kind: 'cycle', cycle: c });
    for (const a of this.rules.evaluate(c, line, st, this.stationsOf(line.id))) this.emit({ kind: 'alert', alert: a });
  }

  private tick() {
    const now = Date.now();
    while (this.schedule.length && this.schedule[0].end <= now) this.commit(this.schedule.shift()!);
    for (const s of this.stations.filter(s => s.sim)) {
      const q = this.scheduled.get(s.id)!;
      while (q.length && q[0].end <= now) q.shift();
      const l = simLive(s.id, q[0], now, this.lineOf(s.lineId)!.taktSec);
      this.live.set(s.id, l); this.emit({ kind: 'live', live: l });
    }
    for (const [cam, tr] of this.trackers) {
      const st = this.stations.find(s => s.cameraId === cam)!;
      const line = this.lineOf(st.lineId)!;
      const l = tr.live(now, line.taktSec);
      if (l.status === 'offline' && this.live.get(st.id)?.status !== 'offline') {
        const a = this.rules.offline(now, line, st); if (a) this.emit({ kind: 'alert', alert: a });
      }
      this.live.set(st.id, l); this.emit({ kind: 'live', live: l });
    }
    for (const d of this.devices.values()) if (d.simulated) {
      d.lastSeen = now; d.fps = 29 + Math.round(Math.random() * 2);
      d.latencyMs = Math.round(d.latencyMs * 0.8 + (d.precision === 'INT8' ? 21 : 29) * 0.2 + (Math.random() - 0.5) * 3);
    }
  }

  lineView(lineId: string) {
    const line = this.lineOf(lineId)!, stations = this.stationsOf(lineId), now = Date.now();
    const cycles = this.store.cyclesForLine(lineId, this.shiftStart);
    // live (non-simulated) cells are measured from their first cycle, not from the simulated shift start
    const from = line.source === 'sim' || !cycles.length ? this.shiftStart : Math.min(...cycles.map(c => c.start));
    return { line, stations: stations.map(stripSim), metrics: lineMetrics(line, stations, cycles, from, now), live: stations.map(s => this.live.get(s.id) ?? null) };
  }

  /** The whole REST API as a pure function of (method, path, query, body). */
  async handle(method: string, path: string, query: URLSearchParams, body: unknown): Promise<ApiResult> {
    const ok = (b: unknown): ApiResult => ({ status: 200, body: b });
    const nf: ApiResult = { status: 404, body: { error: 'not found' } };
    const m = (re: RegExp) => path.match(re);
    let p: RegExpMatchArray | null;
    const b = (body ?? {}) as Record<string, any>;

    if (method === 'GET' && path === '/api/plant') return ok({
      plant: PLANT, shiftStart: this.shiftStart, now: Date.now(),
      lines: this.lines.map(l => { const v = this.lineView(l.id); return { ...v, metrics: { ...v.metrics, trend: undefined } }; }),
      devices: [...this.devices.values()],
      openAlerts: this.store.listAlerts(500).filter(a => !a.acked).length,
    });
    if ((p = m(/^\/api\/lines\/([\w-]+)$/))) {
      const l = this.lineOf(p[1]); if (!l) return nf;
      if (method === 'GET') return ok(this.lineView(l.id));
      if (method === 'PUT') { if (b.taktSec > 1) l.taktSec = Number(b.taktSec); return ok(l); }
    }
    if (method === 'POST' && (p = m(/^\/api\/lines\/([\w-]+)\/reset$/))) {
      const l = this.lineOf(p[1]); if (!l) return nf;
      if (l.source === 'sim') return { status: 400, body: { error: 'cannot reset a simulated line' } };
      this.store.deleteLineCycles(l.id);
      for (const st of this.stationsOf(l.id)) { this.trackers.delete(st.cameraId); this.live.delete(st.id); }
      return ok({ ok: true });
    }
    if (method === 'GET' && (p = m(/^\/api\/stations\/([\w-]+)\/cycles$/))) return ok(this.store.recentCycles(p[1], Number(query.get('limit') ?? 50)));
    if (method === 'GET' && (p = m(/^\/api\/stations\/([\w-]+)\/histogram$/))) {
      const st = this.stationOf(p[1]); if (!st) return nf;
      return ok(histogram(this.store.cyclesForLine(st.lineId, this.shiftStart).filter(c => c.stationId === st.id), 18));
    }
    if (method === 'PUT' && (p = m(/^\/api\/stations\/([\w-]+)\/zones$/))) {
      const st = this.stationOf(p[1]); if (!st) return nf;
      st.zones = b.zones as Zones;
      const tr = this.trackers.get(st.cameraId); if (tr) tr.zones = st.zones;
      return ok(stripSim(st));
    }
    if (method === 'GET' && path === '/api/alerts') return ok(this.store.listAlerts(Number(query.get('limit') ?? 200)));
    if (method === 'POST' && (p = m(/^\/api\/alerts\/([\w-]+)\/ack$/))) { this.store.ackAlert(p[1]); return ok({ ok: true }); }
    if (method === 'GET' && path === '/api/pipegen') {
      try { return ok({ status: 'ok', ...(await this.readReport() as object) }); } catch { return ok({ status: 'pending' }); }
    }
    if (method === 'GET' && path === '/api/devices') return ok([...this.devices.values()]);
    if (method === 'POST' && path === '/api/devices/heartbeat') {
      const d = b as Device; d.lastSeen = Date.now(); d.simulated = false;
      this.devices.set(d.id, d); this.emit({ kind: 'device', device: d }); return ok({ ok: true });
    }
    // completed cycles from a client-side engine (browser Live cell)
    if (method === 'POST' && path === '/api/ingest/cycles') {
      const cycles = (b.cycles ?? []) as Cycle[];
      for (const c of cycles) if (this.stationOf(c.stationId)) this.commit(c);
      return ok({ accepted: cycles.length });
    }
    if (method === 'POST' && path === '/api/ingest/live') {
      const l = b.live as StationLive;
      if (l && this.stationOf(l.stationId)) { this.live.set(l.stationId, l); this.emit({ kind: 'live', live: l }); }
      return ok({ ok: true });
    }
    // raw keypoint frames from the PipeGen DeepStream app (via edge/takt_edge.py)
    if (method === 'POST' && path === '/api/ingest/frames') {
      const frames = (b.frames ?? []) as KeypointFrame[];
      let produced = 0;
      for (const f of frames) {
        const st = this.stations.find(s => s.cameraId === f.cameraId); if (!st) continue;
        let tr = this.trackers.get(f.cameraId);
        if (!tr) { tr = new CycleTracker(st.id, st.zones, 'edge'); this.trackers.set(f.cameraId, tr); }
        const c = tr.update(f.hands ?? [], f.ts);
        if (c) { this.commit(c); produced++; }
      }
      return ok({ frames: frames.length, cycles: produced });
    }
    return nf;
  }
}

function stripSim<T extends { sim?: unknown }>(s: T): Omit<T, 'sim'> {
  const { sim: _sim, ...rest } = s; return rest;
}

/** In-memory store (browser standalone mode, tests). */
export class MemoryStore implements Store {
  private cycles: { cycle: Cycle; lineId: string }[] = [];
  private alerts: Alert[] = [];
  saveCycles(cs: { cycle: Cycle; lineId: string }[]) { for (const c of cs) this.cycles.push(c); }
  cyclesForLine(lineId: string, since: number) {
    return this.cycles.filter(c => c.lineId === lineId && c.cycle.end >= since).map(c => c.cycle).sort((a, b) => a.end - b.end);
  }
  recentCycles(stationId: string, limit: number) {
    const out: Cycle[] = [];
    for (let i = this.cycles.length - 1; i >= 0 && out.length < limit * 4; i--) if (this.cycles[i].cycle.stationId === stationId) out.push(this.cycles[i].cycle);
    return out.sort((a, b) => b.end - a.end).slice(0, limit);
  }
  deleteLineCycles(lineId: string) { this.cycles = this.cycles.filter(c => c.lineId !== lineId); }
  clearSim() { this.cycles = this.cycles.filter(c => c.cycle.source !== 'sim'); this.alerts = []; }
  addAlert(a: Alert) { this.alerts.push(a); }
  listAlerts(limit: number) { return [...this.alerts].sort((a, b) => b.ts - a.ts).slice(0, limit); }
  ackAlert(id: string) { const a = this.alerts.find(x => x.id === id); if (a) a.acked = true; }
}
