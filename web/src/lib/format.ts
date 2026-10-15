export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
export const sec = (n: number, d = 1) => `${n.toFixed(d)}s`;
export const num = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const time = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const timeS = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function ago(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}
export function duration(ms: number) {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
