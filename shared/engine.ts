// Takt cycle engine: turns per-frame hand keypoints into timed work cycles.
// Shared by the server (PipeGen ingest) and the browser (Live cell). No dependencies.
import type { Cycle, Pt, Rect, Source, StationLive, Zones } from './types.ts';

export interface EngineConfig {
  debounceMs: number; // a zone reading must hold this long to count
  microstopMs: number; // no hands in view for this long = micro-stop (waste)
  minCycleSec: number; // discard noise shorter than this
}

export const DEFAULT_ENGINE: EngineConfig = { debounceMs: 150, microstopMs: 8000, minCycleSec: 1.5 };

type Reading = 'pick' | 'place' | 'work' | 'none';
type Phase = StationLive['phase'];

export const inRect = (p: Pt, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Representative point of a hand: palm centre for 21-pt landmarks, else the mean of what we got. */
export function handPoint(hand: Pt[]): Pt {
  const ids = hand.length === 21 ? [0, 5, 9, 13, 17] : hand.map((_, i) => i);
  return {
    x: ids.reduce((s, i) => s + hand[i].x, 0) / ids.length,
    y: ids.reduce((s, i) => s + hand[i].y, 0) / ids.length,
  };
}

export function readZones(hands: Pt[][], zones: Zones): Reading {
  if (!hands.length) return 'none';
  const pts = hands.map(handPoint);
  if (pts.some(p => inRect(p, zones.place))) return 'place';
  if (pts.some(p => inRect(p, zones.pick))) return 'pick';
  return 'work';
}

let seq = 0;
const uid = () => `c_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export class CycleTracker {
  phase: Phase = 'idle';
  private cand: Reading = 'none';
  private candSince = 0;
  private stable: Reading = 'none';
  private start: number | null = null; // cycle start (previous cycle end or first pick)
  private workAt: number | null = null;
  private placeAt: number | null = null;
  private noHandsSince: number | null = null;
  private waste = 0;
  lastSeen = 0;
  lastFrame = 0;
  lastCycleAt: number | null = null;

  stationId: string;
  zones: Zones;
  source: Source;
  cfg: EngineConfig;

  constructor(stationId: string, zones: Zones, source: Source = 'edge', cfg: EngineConfig = DEFAULT_ENGINE) {
    this.stationId = stationId; this.zones = zones; this.source = source; this.cfg = cfg;
  }

  /** Feed one frame. Returns a completed cycle when one closes, else null. */
  update(hands: Pt[][], ts: number): Cycle | null {
    const r = readZones(hands, this.zones);
    this.lastFrame = ts;
    if (r !== 'none') {
      if (this.noHandsSince !== null && ts - this.noHandsSince >= this.cfg.microstopMs && this.start !== null)
        this.waste += (ts - this.noHandsSince) / 1000;
      this.noHandsSince = null;
      this.lastSeen = ts;
    } else if (this.noHandsSince === null) this.noHandsSince = ts;

    if (r !== this.cand) { this.cand = r; this.candSince = ts; }
    if (ts - this.candSince < this.cfg.debounceMs || r === this.stable) return null;
    const prev = this.stable;
    this.stable = r;
    return this.transition(prev, r, ts);
  }

  private transition(prev: Reading, r: Reading, ts: number): Cycle | null {
    if (r === 'pick') {
      if (this.start === null) this.start = this.candSince;
      if (this.phase !== 'place') this.phase = 'pick';
      if (this.phase === 'place') return this.close(this.candSince, 'pick');
      return null;
    }
    if (r === 'work' && this.phase === 'pick') { this.workAt = this.candSince; this.phase = 'work'; return null; }
    if (r === 'place' && (this.phase === 'pick' || this.phase === 'work')) {
      this.placeAt = this.candSince; this.phase = 'place'; return null;
    }
    if (prev === 'place' && this.phase === 'place') return this.close(this.candSince, r === 'none' ? 'idle' : 'work');
    return null;
  }

  private close(end: number, next: Phase): Cycle | null {
    const start = this.start!, placeAt = this.placeAt!, workAt = this.workAt ?? placeAt;
    const duration = (end - start) / 1000;
    const waste = Math.min(this.waste, duration);
    const cycle: Cycle = {
      id: uid(), stationId: this.stationId, start, end,
      duration: round(duration),
      pick: round(Math.max(0, (workAt - start) / 1000 - waste)),
      work: round((placeAt - workAt) / 1000),
      place: round((end - placeAt) / 1000),
      waste: round(waste),
      good: true, source: this.source,
    };
    // next cycle starts where this one ended
    this.start = end; this.workAt = null; this.placeAt = null; this.waste = 0;
    this.phase = next === 'pick' ? 'pick' : 'idle';
    this.lastCycleAt = end;
    return duration >= this.cfg.minCycleSec ? cycle : null;
  }

  live(now: number, taktSec: number): StationLive {
    if (now - this.lastFrame > 15_000) // no frames: the camera is gone, so there is no cycle in progress
      return { stationId: this.stationId, status: 'offline', phase: 'idle', cycleStartedAt: null, lastCycleAt: this.lastCycleAt };
    const idle = this.noHandsSince !== null && now - this.noHandsSince >= this.cfg.microstopMs;
    const over = this.start !== null && (now - this.start) / 1000 > taktSec * 1.15;
    return {
      stationId: this.stationId,
      status: idle ? 'idle' : over ? 'over' : 'running',
      phase: this.phase,
      cycleStartedAt: this.start,
      lastCycleAt: this.lastCycleAt,
    };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
