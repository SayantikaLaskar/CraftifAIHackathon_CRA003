// Demo-line simulator: realistic cycle streams for Lines 1–2 (clearly tagged source='sim').
import type { Cycle, StationLive } from './types.ts';
import type { SimProfile } from './plant.ts';

let seq = 0;

// seeded PRNG so the backfilled shift looks the same on every restart
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(42);
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function simCycle(stationId: string, p: SimProfile, start: number, drift = 0): Cycle {
  // log-normal around the mean; slow drift models fatigue / shift effects
  const sigma = Math.sqrt(Math.log(1 + p.cv * p.cv));
  const mu = Math.log(p.mean * (1 + drift)) - sigma * sigma / 2;
  let dur = Math.exp(mu + sigma * gauss());
  const waste = rand() < p.stopP ? 10 + rand() * 35 : 0;
  dur += waste;
  const core = dur - waste;
  const pick = core * (0.16 + rand() * 0.04), place = core * (0.09 + rand() * 0.03);
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    id: `s_${stationId}_${(seq++).toString(36)}_${start.toString(36)}`, stationId, start, end: start + dur * 1000,
    duration: r(dur), pick: r(pick), work: r(core - pick - place), place: r(place), waste: r(waste),
    good: rand() >= p.reject, source: 'sim',
  };
}

/** drift: mild fatigue before breaks, recovering each hour */
export const driftAt = (t: number) => 0.035 * Math.sin((t / 3_600_000) * Math.PI * 2) + 0.02 * ((t / 3_600_000) % 1);

export function simLive(stationId: string, current: Cycle | undefined, now: number, takt: number): StationLive {
  if (!current || current.start > now) // waiting for the upstream station
    return { stationId, status: 'idle', phase: 'idle', cycleStartedAt: null, lastCycleAt: null };
  const el = (now - current.start) / 1000, f = el / current.duration;
  return {
    stationId,
    status: el > takt ? 'over' : 'running',
    phase: f < current.pick / current.duration ? 'pick' : f < 1 - current.place / current.duration ? 'work' : 'place',
    cycleStartedAt: current.start,
    lastCycleAt: null,
  };
}
