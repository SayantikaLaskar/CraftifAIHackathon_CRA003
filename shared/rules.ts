// Alert rules engine: pure and stateful. Shared by the Node server (persists to SQLite) and the
// browser standalone mode (keeps alerts in memory).
import type { Alert, AlertType, Cycle, Line, Severity, Station } from './types.ts';

export class AlertRules {
  private seq = 0;
  private lastFired = new Map<string, number>();
  private recent = new Map<string, number[]>();
  private lineMeans = new Map<string, Map<string, number>>();
  private bottleneckOf = new Map<string, string>();
  private onRaise: (a: Alert) => void;

  constructor(onRaise: (a: Alert) => void) { this.onRaise = onRaise; }

  private raise(ts: number, line: Line, station: Station | null, type: AlertType, severity: Severity, message: string, dedupeMs = 15 * 60_000): Alert | null {
    const key = `${station?.id ?? line.id}:${type}`;
    if (ts - (this.lastFired.get(key) ?? -Infinity) < dedupeMs) return null;
    this.lastFired.set(key, ts);
    const a: Alert = { id: `a_${ts.toString(36)}_${(this.seq++).toString(36)}`, ts, lineId: line.id, stationId: station?.id ?? null, type, severity, message, acked: false };
    this.onRaise(a);
    return a;
  }

  /** Evaluate rules after a completed cycle; returns any alerts raised. */
  evaluate(c: Cycle, line: Line, station: Station, stations: Station[]): Alert[] {
    const out: (Alert | null)[] = [];
    const r = this.recent.get(station.id) ?? []; r.push(c.duration); if (r.length > 20) r.shift(); this.recent.set(station.id, r);

    const last3 = r.slice(-3);
    if (last3.length === 3 && last3.every(d => d > line.taktSec * 1.05))
      out.push(this.raise(c.end, line, station, 'OVER_TAKT', 'serious',
        `${station.name} exceeded takt (${line.taktSec}s) on 3 consecutive cycles, most recently ${c.duration.toFixed(1)}s.`, 30 * 60_000));
    if (c.waste >= 12)
      out.push(this.raise(c.end, line, station, 'MICROSTOP', 'warning',
        `${station.name} was idle for ${c.waste.toFixed(0)}s inside a cycle (no hands at the station).`, 20 * 60_000));

    // bottleneck shift: rolling mean of the last 20 cycles per station
    const means = this.lineMeans.get(line.id) ?? new Map<string, number>(); this.lineMeans.set(line.id, means);
    means.set(station.id, r.reduce((s, x) => s + x, 0) / r.length);
    if (means.size === stations.length) {
      const [bid, bmean] = [...means.entries()].sort((a, b) => b[1] - a[1])[0];
      if (this.bottleneckOf.get(line.id) !== bid && bmean > line.taktSec) {
        this.bottleneckOf.set(line.id, bid);
        const bs = stations.find(s => s.id === bid)!;
        out.push(this.raise(c.end, line, bs, 'BOTTLENECK', 'critical',
          `${bs.name} (${bs.operation}) is now the bottleneck, averaging ${bmean.toFixed(1)}s against a ${line.taktSec}s takt. The line is losing ${Math.round(3600 / line.taktSec - 3600 / bmean)} units/hr.`, 0));
      }
    }
    return out.filter((a): a is Alert => !!a);
  }

  offline(ts: number, line: Line, station: Station) {
    return this.raise(ts, line, station, 'OFFLINE', 'serious', `${station.name} camera has stopped sending frames.`, 30 * 60_000);
  }
}
