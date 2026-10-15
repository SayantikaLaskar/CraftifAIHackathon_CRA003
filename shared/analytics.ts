// Takt analytics: industrial-engineering metrics computed from timed cycles.
import type { Cycle, Line, Station } from './types.ts';

export interface StationStats {
  stationId: string;
  count: number;
  mean: number;
  median: number;
  p90: number;
  std: number;
  cv: number; // coefficient of variation — work standardisation
  min: number;
  max: number;
  onTaktPct: number; // share of cycles ≤ takt
  segments: { pick: number; work: number; place: number; waste: number }; // mean seconds
  wastePct: number;
  last: number | null;
}

export interface Recommendation {
  id: string;
  kind: 'capacity' | 'rebalance' | 'standardise' | 'microstops';
  title: string;
  detail: string;
  impact: string;
  stationIds: string[];
}

export interface LineMetrics {
  lineId: string;
  windowStart: number;
  now: number;
  units: number;
  uph: number; // units per hour (actual)
  capacityUph: number; // bottleneck-limited capacity
  targetUph: number; // 3600 / takt
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  balanceEfficiency: number;
  bottleneckId: string | null;
  taktAdherence: number;
  stations: StationStats[];
  hourly: { hour: number; units: number; target: number }[];
  trend: { t: number; [stationId: string]: number }[];
  recommendations: Recommendation[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stationStats(stationId: string, cycles: Cycle[], taktSec: number): StationStats {
  const d = cycles.map(c => c.duration).sort((a, b) => a - b);
  const n = d.length;
  const mean = n ? d.reduce((s, x) => s + x, 0) / n : 0;
  const std = n > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const seg = (k: 'pick' | 'work' | 'place' | 'waste') => (n ? cycles.reduce((s, c) => s + c[k], 0) / n : 0);
  const waste = seg('waste');
  return {
    stationId, count: n, mean: r2(mean), median: r2(quantile(d, 0.5)), p90: r2(quantile(d, 0.9)),
    std: r2(std), cv: mean ? r2(std / mean) : 0, min: d[0] ?? 0, max: d[n - 1] ?? 0,
    onTaktPct: n ? d.filter(x => x <= taktSec).length / n : 0,
    segments: { pick: r2(seg('pick')), work: r2(seg('work')), place: r2(seg('place')), waste: r2(waste) },
    wastePct: mean ? waste / mean : 0,
    last: cycles.length ? cycles[cycles.length - 1].duration : null,
  };
}

export function histogram(cycles: Cycle[], bins = 16, lo?: number, hi?: number) {
  const d = cycles.map(c => c.duration);
  if (!d.length) return [];
  const a = lo ?? Math.floor(Math.min(...d)), b = hi ?? Math.ceil(Math.max(...d));
  const w = Math.max(0.5, (b - a) / bins);
  const out = Array.from({ length: bins }, (_, i) => ({ from: r2(a + i * w), to: r2(a + (i + 1) * w), count: 0 }));
  for (const x of d) out[Math.min(bins - 1, Math.max(0, Math.floor((x - a) / w)))].count++;
  return out;
}

export function recommend(line: Line, stations: Station[], stats: StationStats[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const byId = new Map(stats.map(s => [s.stationId, s]));
  const ordered = [...stations].sort((a, b) => a.order - b.order).filter(s => byId.get(s.id)?.count);
  if (ordered.length < 2) return recs;
  const means = ordered.map(s => byId.get(s.id)!.mean);
  const bi = means.indexOf(Math.max(...means));
  const b = ordered[bi], bs = byId.get(b.id)!;

  // 0. Capacity gap: the bottleneck alone cannot meet takt.
  if (means[bi] > line.taktSec) {
    const cut = means[bi] - line.taktSec;
    recs.push({
      id: `capacity-${b.id}`, kind: 'capacity',
      title: `${b.name} can't meet takt. It needs ${cut.toFixed(1)}s less per cycle.`,
      detail: `The line has to complete a unit every ${line.taktSec}s (${Math.round(3600 / line.taktSec)} u/hr), but ${b.name} averages ${means[bi].toFixed(1)}s, ` +
        `which caps the whole line at ${Math.round(3600 / means[bi])} u/hr. Every station downstream waits on it. The cut can come from rebalancing work (below) or a fixture or tooling improvement.`,
      impact: `${Math.round(3600 / line.taktSec - 3600 / means[bi])} units/hr currently lost`,
      stationIds: [b.id],
    });
  }
  // 1. Rebalance work content from the bottleneck to the neighbour with most slack.
  const neighbours = [bi - 1, bi + 1].filter(i => i >= 0 && i < ordered.length);
  const ni = neighbours.sort((x, y) => means[x] - means[y])[0];
  if (ni !== undefined && means[bi] - means[ni] > 2) {
    const transfer = Math.min((means[bi] - means[ni]) / 2, bs.segments.work * 0.5);
    const after = [...means]; after[bi] -= transfer; after[ni] += transfer;
    const newMax = Math.max(...after), gain = means[bi] / newMax - 1;
    const n = ordered[ni];
    recs.push({
      id: `rebalance-${b.id}`, kind: 'rebalance',
      title: `Move ${transfer.toFixed(1)}s of work from ${b.name} to ${n.name}`,
      detail: `${b.name} is the bottleneck at ${means[bi].toFixed(1)}s against a ${line.taktSec}s takt, while ${n.name} averages ${means[ni].toFixed(1)}s. ` +
        `Shifting part of the ${b.operation.toLowerCase()} element evens the line, and the slowest station would drop to ${newMax.toFixed(1)}s.`,
      impact: `+${Math.round(gain * 100)}% line capacity · +${Math.round(3600 / newMax - 3600 / means[bi])} units/hr`,
      stationIds: [b.id, n.id],
    });
  }
  // 2. Standardise work where variability is high.
  const varied = ordered.map(s => byId.get(s.id)!).filter(s => s.cv > 0.18).sort((a, b) => b.cv - a.cv)[0];
  if (varied) {
    const st = stations.find(s => s.id === varied.stationId)!;
    const saved = Math.max(0, varied.p90 - varied.median);
    recs.push({
      id: `standardise-${st.id}`, kind: 'standardise',
      title: `Standardise the method at ${st.name}`,
      detail: `Cycle time varies by ${pct(varied.cv)} (CV). The median cycle is ${varied.median.toFixed(1)}s, but 1 in 10 cycles takes more than ${varied.p90.toFixed(1)}s. ` +
        `Review the slowest recorded cycles with the operator and lock in the best-practice sequence.`,
      impact: `up to ${saved.toFixed(1)}s off slow cycles`,
      stationIds: [st.id],
    });
  }
  // 3. Micro-stops.
  const stoppy = ordered.map(s => byId.get(s.id)!).filter(s => s.wastePct > 0.05).sort((a, b) => b.wastePct - a.wastePct)[0];
  if (stoppy) {
    const st = stations.find(s => s.id === stoppy.stationId)!;
    recs.push({
      id: `microstops-${st.id}`, kind: 'microstops',
      title: `Eliminate micro-stops at ${st.name}`,
      detail: `${pct(stoppy.wastePct)} of the average cycle at ${st.name} is spent with no hands at the station for 8s or more. ` +
        `That usually means waiting for parts, searching for tools, or a feeder running dry.`,
      impact: `recover ${stoppy.segments.waste.toFixed(1)}s per cycle`,
      stationIds: [st.id],
    });
  }
  return recs;
}

export function lineMetrics(line: Line, stations: Station[], cycles: Cycle[], windowStart: number, now: number): LineMetrics {
  const byStation = new Map<string, Cycle[]>(stations.map(s => [s.id, []]));
  for (const c of cycles) byStation.get(c.stationId)?.push(c);
  const stats = stations.map(s => stationStats(s.id, byStation.get(s.id)!, line.taktSec));
  const active = stats.filter(s => s.count);
  const ordered = [...stations].sort((a, b) => a.order - b.order);
  const lastId = ordered[ordered.length - 1]?.id;
  const finished = byStation.get(lastId) ?? [];

  const elapsedS = Math.max(1, (now - windowStart) / 1000);
  const plannedS = Math.min(elapsedS, line.plannedMinutes * 60);
  const downtime = finished.reduce((s, c) => s + c.waste, 0);
  const runS = Math.max(1, plannedS - downtime);
  const units = finished.length;
  const good = finished.filter(c => c.good).length;
  const availability = Math.min(1, runS / plannedS);
  const performance = Math.min(1, (line.idealCycleSec * units) / runS);
  const quality = units ? good / units : 1;

  const maxMean = Math.max(0, ...active.map(s => s.mean));
  const bottleneck = active.find(s => s.mean === maxMean);
  const balance = active.length && maxMean ? active.reduce((s, x) => s + x.mean, 0) / (active.length * maxMean) : 0;
  const allCycles = active.reduce((s, x) => s + x.count, 0);
  const onTakt = active.reduce((s, x) => s + x.onTaktPct * x.count, 0);

  // hourly throughput buckets
  const hourly: LineMetrics['hourly'] = [];
  const h0 = Math.floor(windowStart / 3_600_000) * 3_600_000;
  for (let h = h0; h <= now; h += 3_600_000) {
    const span = (Math.min(now, h + 3_600_000) - Math.max(windowStart, h)) / 1000;
    hourly.push({ hour: h, units: finished.filter(c => c.end >= h && c.end < h + 3_600_000).length, target: Math.round(span / line.taktSec) });
  }
  // 10-minute rolling mean per station
  const trend: LineMetrics['trend'] = [];
  const step = 600_000;
  for (let t = Math.floor(windowStart / step) * step; t <= now; t += step) {
    const row: LineMetrics['trend'][number] = { t };
    for (const s of stations) {
      const cs = byStation.get(s.id)!.filter(c => c.end >= t && c.end < t + step);
      if (cs.length) row[s.id] = r2(cs.reduce((a, c) => a + c.duration, 0) / cs.length);
    }
    trend.push(row);
  }

  return {
    lineId: line.id, windowStart, now, units,
    uph: r2(units / (elapsedS / 3600)),
    capacityUph: maxMean ? r2(3600 / maxMean) : 0,
    targetUph: r2(3600 / line.taktSec),
    oee: availability * performance * quality, availability, performance, quality,
    balanceEfficiency: balance,
    bottleneckId: bottleneck?.stationId ?? null,
    taktAdherence: allCycles ? onTakt / allCycles : 0,
    stations: stats, hourly, trend,
    recommendations: recommend(line, stations, stats),
  };
}
