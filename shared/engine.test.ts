import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CycleTracker, readZones } from './engine.ts';
import { lineMetrics, stationStats } from './analytics.ts';
import type { Cycle, Line, Station, Zones } from './types.ts';

const zones: Zones = { pick: { x: 0, y: 0, w: 0.3, h: 1 }, place: { x: 0.7, y: 0, w: 0.3, h: 1 } };
const hand = (x: number) => [[{ x, y: 0.5 }]];
const FPS = 30, dt = 1000 / FPS;

/** Drive the tracker through a sequence of [handX | null, seconds] segments. */
function drive(tr: CycleTracker, plan: [number | null, number][], t0 = 0) {
  const out: Cycle[] = []; let t = t0;
  for (const [x, secs] of plan) {
    for (let i = 0; i < secs * FPS; i++, t += dt) {
      const c = tr.update(x === null ? [] : hand(x), t);
      if (c) out.push(c);
    }
  }
  return { cycles: out, t };
}

test('readZones classifies pick / place / work / none', () => {
  assert.equal(readZones([], zones), 'none');
  assert.equal(readZones(hand(0.1), zones), 'pick');
  assert.equal(readZones(hand(0.5), zones), 'work');
  assert.equal(readZones(hand(0.9), zones), 'place');
});

test('pick → work → place produces timed cycles with Yamazumi segments', () => {
  const tr = new CycleTracker('st1', zones);
  const one: [number | null, number][] = [[0.1, 2], [0.5, 5], [0.9, 1]];
  const { cycles } = drive(tr, [...one, ...one, ...one, [0.5, 1]]);
  assert.equal(cycles.length, 3);
  for (const c of cycles) {
    assert.ok(Math.abs(c.duration - 8) < 0.3, `duration ${c.duration}`);
    assert.ok(Math.abs(c.work - 5) < 0.3, `work ${c.work}`);
    assert.ok(Math.abs(c.place - 1) < 0.3, `place ${c.place}`);
    assert.ok(Math.abs(c.pick + c.work + c.place + c.waste - c.duration) < 0.1);
  }
});

test('jitter shorter than debounce is ignored', () => {
  const tr = new CycleTracker('st1', zones);
  const { cycles } = drive(tr, [[0.1, 2], [0.5, 2], [0.9, 0.05], [0.5, 2], [0.9, 1], [0.5, 1]]);
  assert.equal(cycles.length, 1);
});

test('absence ≥ 8s is booked as micro-stop waste', () => {
  const tr = new CycleTracker('st1', zones);
  const { cycles } = drive(tr, [[0.1, 1], [0.9, 1], [null, 10], [0.1, 1], [0.5, 3], [0.9, 1], [0.5, 1]]);
  const c = cycles[cycles.length - 1];
  assert.ok(c.waste >= 9.5, `waste ${c.waste}`);
});

test('analytics: bottleneck, balance and rebalance recommendation', () => {
  const line: Line = { id: 'L', name: 'L', product: 'p', taktSec: 40, idealCycleSec: 36, plannedMinutes: 480, source: 'sim' };
  const mk = (id: string, order: number): Station => ({ id, lineId: 'L', name: id.toUpperCase(), operation: 'Fasten', order, cameraId: id, zones });
  const stations = [mk('a', 1), mk('b', 2), mk('c', 3)];
  const cyc = (sid: string, d: number, i: number): Cycle => ({ id: `${sid}${i}`, stationId: sid, start: i * d * 1000, end: (i + 1) * d * 1000, duration: d, pick: 4, work: d - 6, place: 2, waste: 0, good: true, source: 'sim' });
  const cycles = [
    ...Array.from({ length: 50 }, (_, i) => cyc('a', 36, i)),
    ...Array.from({ length: 50 }, (_, i) => cyc('b', 48, i)),
    ...Array.from({ length: 50 }, (_, i) => cyc('c', 30, i)),
  ];
  const m = lineMetrics(line, stations, cycles, 0, 3_600_000);
  assert.equal(m.bottleneckId, 'b');
  assert.ok(Math.abs(m.balanceEfficiency - (36 + 48 + 30) / (3 * 48)) < 1e-6);
  const rb = m.recommendations.find(r => r.kind === 'rebalance');
  assert.ok(m.recommendations.some(r => r.kind === 'capacity'));
  assert.ok(rb && rb.stationIds[0] === 'b' && rb.stationIds[1] === 'c', JSON.stringify(m.recommendations));
  assert.equal(stationStats('a', cycles.slice(0, 50), 40).onTaktPct, 1);
});

test('a camera that stops sending frames reports offline with no running cycle', () => {
  const tr = new CycleTracker('st1', zones);
  const { t } = drive(tr, [[0.1, 1], [0.5, 1]]);
  const l = tr.live(t + 20_000, 10);
  assert.equal(l.status, 'offline');
  assert.equal(l.cycleStartedAt, null);
});
