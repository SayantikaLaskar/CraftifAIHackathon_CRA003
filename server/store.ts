// SQLite persistence for the plant runtime (node:sqlite, no native deps).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Alert, Cycle } from '../shared/types.ts';
import type { Store } from '../shared/runtime.ts';

type Row = Record<string, any>;
const toCycle = (r: Row): Cycle => ({
  id: r.id, stationId: r.station_id, start: r.start, end: r.end, duration: r.duration,
  pick: r.pick, work: r.work, place: r.place, waste: r.waste, good: !!r.good, source: r.source,
});
const toAlert = (r: Row): Alert => ({ id: r.id, ts: r.ts, lineId: r.line_id, stationId: r.station_id, type: r.type, severity: r.severity, message: r.message, acked: !!r.acked });

export class SqliteStore implements Store {
  private db: DatabaseSync;
  constructor(path = process.env.TAKT_DB ?? new URL('./data/takt.db', import.meta.url).pathname) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cycles (
        id TEXT PRIMARY KEY, station_id TEXT, line_id TEXT, start INTEGER, end INTEGER, duration REAL,
        pick REAL, work REAL, place REAL, waste REAL, good INTEGER, source TEXT);
      CREATE INDEX IF NOT EXISTS cycles_line_end ON cycles(line_id, end);
      CREATE INDEX IF NOT EXISTS cycles_station_end ON cycles(station_id, end);
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY, ts INTEGER, line_id TEXT, station_id TEXT, type TEXT, severity TEXT, message TEXT, acked INTEGER);
      CREATE INDEX IF NOT EXISTS alerts_ts ON alerts(ts);
    `);
  }
  saveCycles(cs: { cycle: Cycle; lineId: string }[]) {
    const ins = this.db.prepare(`INSERT OR IGNORE INTO cycles VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    this.db.exec('BEGIN');
    for (const { cycle: c, lineId } of cs) ins.run(c.id, c.stationId, lineId, c.start, c.end, c.duration, c.pick, c.work, c.place, c.waste, c.good ? 1 : 0, c.source);
    this.db.exec('COMMIT');
  }
  cyclesForLine(lineId: string, since: number) {
    return (this.db.prepare(`SELECT * FROM cycles WHERE line_id = ? AND end >= ? ORDER BY end`).all(lineId, since) as Row[]).map(toCycle);
  }
  recentCycles(stationId: string, limit: number) {
    return (this.db.prepare(`SELECT * FROM cycles WHERE station_id = ? ORDER BY end DESC LIMIT ?`).all(stationId, limit) as Row[]).map(toCycle);
  }
  deleteLineCycles(lineId: string) { this.db.prepare(`DELETE FROM cycles WHERE line_id = ?`).run(lineId); }
  clearSim() { this.db.prepare(`DELETE FROM cycles WHERE source = 'sim'`).run(); this.db.prepare(`DELETE FROM alerts`).run(); }
  addAlert(a: Alert) {
    this.db.prepare(`INSERT OR IGNORE INTO alerts VALUES (?,?,?,?,?,?,?,0)`).run(a.id, a.ts, a.lineId, a.stationId, a.type, a.severity, a.message);
  }
  listAlerts(limit: number) { return (this.db.prepare(`SELECT * FROM alerts ORDER BY ts DESC LIMIT ?`).all(limit) as Row[]).map(toAlert); }
  ackAlert(id: string) { this.db.prepare(`UPDATE alerts SET acked = 1 WHERE id = ?`).run(id); }
}
