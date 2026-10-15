import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { gsap, useGSAP } from '../lib/motion.ts';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StationStats } from '@shared/analytics.ts';
import type { Station } from '@shared/types.ts';
import { time } from '../lib/format.ts';

export const SEGMENTS = [
  { key: 'work', label: 'Work', color: 'var(--color-s-work)' },
  { key: 'pick', label: 'Pick', color: 'var(--color-s-pick)' },
  { key: 'place', label: 'Place', color: 'var(--color-s-place)' },
  { key: 'waste', label: 'Micro-stop', color: 'var(--color-s-waste)' },
] as const;

const TICK = { fontSize: 11, fill: 'var(--color-muted)' };

// categorical series order (validated adjacent-pair palette)
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Legend({ items }: { items: { label: ReactNode; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {it.dashed
            ? <svg width="16" height="2" aria-hidden><line x1="0" y1="1" x2="16" y2="1" stroke={it.color} strokeWidth="2" strokeDasharray="3 3" /></svg>
            : <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function TipBox({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none rounded-lg bg-surface px-3 py-2.5 text-[12px] shadow-pop">{children}</div>;
}
function TipRow({ color, label, value, dashed }: { color?: string; label: ReactNode; value: ReactNode; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color && (dashed
        ? <svg width="10" height="2"><line x1="0" y1="1" x2="10" y2="1" stroke={color} strokeWidth="2" strokeDasharray="2 2" /></svg>
        : <span className="size-2 rounded-[2px]" style={{ background: color }} />)}
      <span className="text-ink-2">{label}</span>
      <span className="ml-auto pl-4 font-medium text-ink tnum">{value}</span>
    </div>
  );
}

/** Yamazumi: stacked work content per station vs takt — the IE's line-balance chart. */
export function Yamazumi({ stations, stats, takt, bottleneckId, height = 300, highlight, onSelect }: {
  stations: Station[]; stats: StationStats[]; takt: number; bottleneckId: string | null; height?: number;
  highlight?: string | null; onSelect?: (id: string) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const rows = stations.map(s => ({ s, st: stats.find(x => x.stationId === s.id)! })).filter(r => r.st?.count);
  const padL = 36, padR = 70, padT = 18, padB = 44;
  const innerW = Math.max(0, w - padL - padR), innerH = height - padT - padB;
  const max = Math.max(takt * 1.25, ...rows.map(r => r.st.mean)) * 1.04;
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const band = rows.length ? innerW / rows.length : 0;
  const bw = Math.min(64, band * 0.56);
  const ticks = niceTicks(max, 5);

  // bars rise from the baseline once, the first time the chart has a size
  useGSAP(() => {
    if (!w || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.from('.yz-col', { scaleY: 0, svgOrigin: `0 ${padT + innerH}`, duration: 0.9, ease: 'power3.out', stagger: 0.07 });
    gsap.from('.yz-val', { autoAlpha: 0, y: 6, duration: 0.4, stagger: 0.07, delay: 0.45 });
    gsap.from('.yz-takt-line', { scaleX: 0, svgOrigin: `${padL} 0`, duration: 0.9, ease: 'power2.inOut', delay: 0.2 });
  }, { scope: ref, dependencies: [w > 0] });

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="Yamazumi chart: stacked cycle-time content per station versus takt time">
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" strokeWidth={t === 0 ? 1 : 0.75} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tnum">{t}s</text>
            </g>
          ))}
          {rows.map(({ s, st }, i) => {
            const cx = padL + band * i + band / 2, x = cx - bw / 2;
            let acc = 0;
            const segs = SEGMENTS.map(seg => {
              const v = st.segments[seg.key];
              const y0 = y(acc), y1 = y(acc + v); acc += v;
              return { ...seg, v, y0, y1 };
            }).filter(g => g.v > 0.05);
            const total = acc;
            const isB = s.id === bottleneckId;
            const dim = (highlight && highlight !== s.id) || (hover !== null && hover !== i);
            return (
              <g key={s.id} opacity={dim ? 0.45 : 1} style={{ transition: 'opacity .15s', cursor: onSelect ? 'pointer' : undefined }}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(s.id)}>
                <rect x={padL + band * i} y={padT} width={band} height={innerH} fill="transparent" />
                <g className="yz-col">
                {segs.map((g, j) => {
                  const top = j === segs.length - 1;
                  const h = Math.max(0, g.y0 - g.y1 - (top ? 0 : 2));
                  return top
                    ? <path key={g.key} d={roundedTop(x, g.y1, bw, h, 4)} fill={g.color} />
                    : <rect key={g.key} x={x} y={g.y1 + 2} width={bw} height={h} fill={g.color} />;
                })}
                </g>
                <text x={cx} y={y(total) - 7} textAnchor="middle" stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke" className="yz-val fill-ink text-[11.5px] font-medium tnum">{st.mean.toFixed(1)}s</text>
                <text x={cx} y={height - padB + 18} textAnchor="middle" className="fill-ink text-[12px] font-medium">{s.name}</text>
                {isB
                  ? <text x={cx} y={height - padB + 34} textAnchor="middle" className="fill-critical-ink text-[11px] font-medium">{band < 84 ? '▲' : '▲ Bottleneck'}</text>
                  : band >= 84 && <text x={cx} y={height - padB + 34} textAnchor="middle" className="fill-muted text-[11px] tnum">{Math.round((st.mean / takt) * 100)}% of takt</text>}
              </g>
            );
          })}
          <line className="yz-takt-line" x1={padL} x2={w - padR} y1={y(takt)} y2={y(takt)} stroke="var(--color-critical)" strokeWidth="1.5" strokeDasharray="5 4" />
          <rect x={w - padR + 6} y={y(takt) - 9} width={62} height={18} rx={4} fill="var(--color-critical-bg)" />
          <text x={w - padR + 37} y={y(takt)} dy="0.32em" textAnchor="middle" className="fill-critical-ink text-[11px] font-medium tnum">Takt {takt}s</text>
        </svg>
      )}
      {hover !== null && rows[hover] && w > 0 && (() => {
        const { s, st } = rows[hover];
        const left = Math.min(w - 210, Math.max(0, padL + band * hover + band / 2 + bw / 2 + 8));
        return (
          <div className="absolute z-10" style={{ left, top: 8 }}>
            <TipBox>
              <div className="mb-1 font-semibold text-ink">{s.name} <span className="font-normal text-muted">· {s.operation}</span></div>
              {SEGMENTS.map(g => <TipRow key={g.key} color={g.color} label={g.label} value={`${st.segments[g.key].toFixed(1)}s`} />)}
              <div className="my-1 border-t border-line" />
              <TipRow label="Mean cycle" value={`${st.mean.toFixed(1)}s`} />
              <TipRow label="On takt" value={`${Math.round(st.onTaktPct * 100)}%`} />
              <TipRow label="Cycles" value={st.count} />
            </TipBox>
          </div>
        );
      })()}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function niceTicks(max: number, n: number) {
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => +(i * step).toFixed(2));
}

/** Rolling 10-minute mean cycle time per station with takt reference. */
export function TrendChart({ data, stations, takt, height = 260, focus }: {
  data: { t: number; [k: string]: number }[]; stations: Station[]; takt: number; height?: number; focus?: string | null;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" strokeWidth={0.75} />
          <XAxis tick={TICK} dataKey="t" tickFormatter={time} tickLine={false} axisLine={{ stroke: 'var(--color-axis)' }} minTickGap={40} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} unit="s" width={44} domain={['dataMin - 4', 'dataMax + 4']} tickFormatter={(v: number) => String(Math.round(v))} />
          <ReferenceLine y={takt} stroke="var(--color-critical)" strokeDasharray="5 4" strokeWidth={1.5} />
          <Tooltip cursor={{ stroke: 'var(--color-axis)' }} content={({ active, payload, label }) => active && payload?.length ? (
            <TipBox>
              <div className="mb-1 font-semibold">{time(Number(label))} – {time(Number(label) + 600_000)}</div>
              {payload.map(p => <TipRow key={String(p.dataKey)} color={String(p.color)} label={stations.find(s => s.id === p.dataKey)?.name} value={`${Number(p.value).toFixed(1)}s`} />)}
              <TipRow color="var(--color-critical)" dashed label="Takt" value={`${takt}s`} />
            </TipBox>
          ) : null} />
          {stations.map((s, i) => (
            <Line key={s.id} dataKey={s.id} stroke={SERIES[i]} strokeWidth={focus && focus !== s.id ? 1.25 : 2} strokeOpacity={focus && focus !== s.id ? 0.3 : 1}
              dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Units per hour vs target. */
export function ThroughputChart({ data, height = 220 }: { data: { hour: number; units: number; target: number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--color-grid)" strokeWidth={0.75} />
          <XAxis tick={TICK} dataKey="hour" tickFormatter={time} tickLine={false} axisLine={{ stroke: 'var(--color-axis)' }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} />
          <Tooltip cursor={{ fill: 'var(--color-sunken)' }} content={({ active, payload, label }) => active && payload?.length ? (
            <TipBox>
              <div className="mb-1 font-semibold">{time(Number(label))}–{time(Number(label) + 3_600_000)}</div>
              <TipRow color="var(--color-s-work)" label="Units" value={payload[0].payload.units} />
              <TipRow color="var(--color-muted)" label="Target" value={payload[0].payload.target} />
            </TipBox>
          ) : null} />
          <Bar dataKey="target" fill="var(--color-grid)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="units" fill="var(--color-s-work)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cycle-time distribution for one station, with takt marker. */
export function Histogram({ bins, takt, median, height = 236 }: { bins: { from: number; to: number; count: number }[]; takt: number; median?: number; height?: number }) {
  const data = bins.map(b => ({ ...b, mid: (b.from + b.to) / 2 }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" strokeWidth={0.75} />
          <XAxis tick={TICK} dataKey="mid" type="number" domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(v: number) => `${Math.round(v)}s`} tickLine={false} axisLine={{ stroke: 'var(--color-axis)' }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'var(--color-sunken)' }} content={({ active, payload }) => active && payload?.length ? (
            <TipBox>
              <div className="mb-1 font-semibold">{payload[0].payload.from.toFixed(1)}–{payload[0].payload.to.toFixed(1)}s</div>
              <TipRow color="var(--color-s-work)" label="Cycles" value={payload[0].payload.count} />
            </TipBox>
          ) : null} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false} fill="var(--color-s-work)" />
          {median !== undefined && <ReferenceLine x={median} stroke="var(--color-ink-2)" strokeWidth={1.5} label={{ value: 'median', position: 'top', fontSize: 11, fill: 'var(--color-ink-2)' }} />}
          <ReferenceLine x={takt} stroke="var(--color-critical)" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: 'takt', position: 'top', fontSize: 11, fill: 'var(--color-critical-ink)' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ values, target: refLine, width = 96, height = 28, color = 'var(--color-ink)' }: { values: number[]; target?: number; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const lo = Math.min(...values, refLine ?? Infinity) * 0.97, hi = Math.max(...values, refLine ?? -Infinity) * 1.03;
  const x = (i: number) => (i / (values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4);
  return (
    <svg width={width} height={height} aria-hidden>
      {refLine !== undefined && <line x1={0} x2={width} y1={y(refLine)} y2={y(refLine)} stroke="var(--color-critical)" strokeDasharray="2 2" strokeWidth={1} opacity={0.7} />}
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
