import clsx from 'clsx';
import { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useRealtime, useResource } from '../../lib/api.ts';
import type { Cycle } from '../../lib/api.ts';
import { gsap, motionOK, useGSAP } from '../../lib/motion.ts';
import type { LineView, PlantView } from '../../lib/api.ts';
import { LiveDot, Skeleton } from '../ui.tsx';

const SEGMENTS = [
  { key: 'work', label: 'Work', cls: 'bg-s-work' },
  { key: 'pick', label: 'Pick', cls: 'bg-s-pick' },
  { key: 'place', label: 'Place', cls: 'bg-s-place' },
  { key: 'waste', label: 'Waste', cls: 'bg-s-waste' },
] as const;

/** A framed, screenshot-style view of the real console, fed by /api/plant. */
export function ProductPreview() {
  const { data } = useResource<PlantView>('/api/plant', { every: 5000 });
  const view = data?.lines.find(l => l.line.id === 'l1') ?? data?.lines[0] ?? null;
  const scope = useRef<HTMLDivElement>(null);

  // first data arrival: bars grow from the baseline, KPIs count up, recommendation slides in
  useGSAP(() => {
    if (!view) return;
    const mm = motionOK(() => {
      gsap.from('.yz-bar', { scaleY: 0, transformOrigin: '50% 100%', duration: 1.1, ease: 'power3.out', stagger: 0.09, delay: 0.5 });
      gsap.from('.yz-label', { autoAlpha: 0, y: 6, duration: 0.5, stagger: 0.09, delay: 1.0 });
      gsap.from('.yz-takt', { scaleX: 0, transformOrigin: '0% 50%', duration: 1, ease: 'power2.inOut', delay: 0.4 });
      gsap.from('.pv-rec', { autoAlpha: 0, x: 24, duration: 0.8, delay: 0.9 });
      gsap.utils.toArray<HTMLElement>('.pv-kpi').forEach((el, i) => {
        const m = (el.textContent ?? '').match(/^([\d.]+)(.*)$/); if (!m) return;
        const target = parseFloat(m[1]), dec = m[1].split('.')[1]?.length ?? 0, o = { v: 0 };
        const node = el.firstChild as Text | null; if (!node) return; // write into React's own text node so live refreshes keep working
        node.nodeValue = `${(0).toFixed(dec)}${m[2]}`;
        gsap.to(o, { v: target, duration: 1.4, delay: 0.35 + i * 0.08, ease: 'power2.out', onUpdate: () => { node.nodeValue = `${o.v.toFixed(dec)}${m[2]}`; } });
      });
      // continuous: a measurement scan line sweeps the chart
      gsap.fromTo('.yz-scan', { left: '0%', autoAlpha: 0 }, {
        keyframes: [{ autoAlpha: 1, duration: 0.3 }, { left: '100%', duration: 3.4, ease: 'none' }, { autoAlpha: 0, duration: 0.3 }],
        repeat: -1, repeatDelay: 0.6, delay: 1.6,
      });
    });
    return () => mm.revert();
  }, { scope, dependencies: [!!view] });

  return (
    <div ref={scope} className="relative">
      <div className="overflow-hidden rounded-xl bg-surface shadow-[0_24px_64px_-16px_rgba(11,11,11,0.14),0_0_0_1px_rgba(11,11,11,0.08)]">
        {/* window chrome */}
        <div className="flex h-10 items-center gap-3 border-b border-line bg-surface-2 px-4">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#e1e0d9]" />
            <span className="size-2.5 rounded-full bg-[#e1e0d9]" />
            <span className="size-2.5 rounded-full bg-[#e1e0d9]" />
          </div>
          <div className="mx-auto hidden h-6 min-w-0 items-center rounded-md bg-sunken px-3 font-mono text-[11px] text-muted sm:flex">
            takt.local/app/lines/l1
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2 sm:ml-0">
            <LiveDot /> Live
          </div>
        </div>
        {view ? <Body view={view} /> : <Loading />}
      </div>
      {view && <CycleToast view={view} />}
    </div>
  );
}

function Body({ view }: { view: LineView }) {
  const { line, stations, metrics: m } = view;
  const rec = m.recommendations.find(r => r.kind === 'rebalance') ?? m.recommendations[0];
  const kpis = [
    { label: 'OEE', value: `${(m.oee * 100).toFixed(1)}%`, sub: `A ${pct(m.availability)} · P ${pct(m.performance)} · Q ${pct(m.quality)}` },
    { label: 'Units / hr', value: m.uph.toFixed(1), sub: `Target ${Math.round(m.targetUph)} · ${Math.round((m.uph / m.targetUph - 1) * 100)}%` },
    { label: 'Balance efficiency', value: pct(m.balanceEfficiency), sub: 'Σ work ÷ (n × bottleneck)' },
    { label: 'Takt adherence', value: pct(m.taktAdherence), sub: `Cycles ≤ ${line.taktSec}s takt` },
  ];
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight">{line.name}</div>
          <div className="text-[12.5px] text-muted">{line.product} · {stations.length} stations · takt {line.taktSec}s</div>
        </div>
        <div className="tnum text-[12px] text-muted">{m.units.toLocaleString('en-IN')} units this shift</div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line lg:grid-cols-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-surface px-4 py-3.5">
            <dt className="text-[12px] text-ink-2">{k.label}</dt>
            <dd className="pv-kpi tnum mt-1.5 text-[22px] font-semibold leading-none tracking-tight sm:text-[24px]">{k.value}</dd>
            <dd className="tnum mt-2 truncate text-[11.5px] text-muted">{k.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] font-semibold tracking-tight">Line balance <span className="font-normal text-muted">· Yamazumi</span></div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
              {SEGMENTS.map(s => (
                <li key={s.key} className="flex items-center gap-1.5"><span className={clsx('size-2 rounded-[2px]', s.cls)} />{s.label}</li>
              ))}
            </ul>
          </div>
          <Yamazumi view={view} />
        </div>

        {rec ? (
          <div className="pv-rec flex flex-col rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-brand-700">
              <Sparkles size={13} strokeWidth={2.25} /> Top recommendation
            </div>
            <div className="mt-2.5 text-[14px] font-semibold leading-snug tracking-tight">{rec.title}</div>
            <p className="mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-ink-2">{rec.detail}</p>
            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between gap-2 rounded-md bg-brand-50 px-3 py-2 text-[12.5px] font-medium text-brand-700">
                <span className="tnum">{rec.impact}</span>
                <ArrowRight size={14} className="shrink-0" />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center rounded-lg border border-line bg-surface-2 p-4 text-[13px] text-muted">Line is balanced. No action needed.</div>
        )}
      </div>
    </div>
  );
}

function Yamazumi({ view }: { view: LineView }) {
  const { line, metrics: m } = view;
  const byId = new Map(m.stations.map(s => [s.stationId, s]));
  const rows = [...view.stations].sort((a, b) => a.order - b.order).map(s => ({ station: s, stats: byId.get(s.id) }));
  const peak = Math.max(line.taktSec, ...rows.map(r => r.stats?.mean ?? 0));
  const step = peak > 60 ? 20 : 10;
  const max = Math.ceil((peak * 1.2) / step) * step;
  const ticks = Array.from({ length: max / step }, (_, i) => (i + 1) * step);
  const y = (v: number) => `${(v / max) * 100}%`;

  return (
    <figure className="mt-4" aria-label={`Yamazumi chart of mean cycle time per station against a ${line.taktSec} second takt`}>
      <div className="relative mr-14 ml-7 h-[188px] border-b border-axis">
        {/* gridlines */}
        {ticks.map(t => (
          <div key={t} className="absolute inset-x-0 border-t border-grid/70" style={{ bottom: y(t) }}>
            <span className="tnum absolute -left-7 -translate-y-1/2 text-[10px] text-muted">{t}s</span>
          </div>
        ))}
        {/* bars */}
        <div className="absolute inset-0 flex items-end justify-around gap-2 px-1 sm:gap-4">
          {rows.map(({ station, stats }) => {
            const isB = station.id === m.bottleneckId;
            const mean = stats?.mean ?? 0;
            return (
              <div key={station.id} className="relative flex h-full w-full max-w-[52px] flex-col justify-end">
                <div className={clsx('yz-label tnum absolute inset-x-0 text-center text-[10.5px] font-medium', isB ? 'text-critical-ink' : 'text-ink-2')} style={{ bottom: `calc(${y(mean)} + 4px)` }}>
                  {mean.toFixed(1)}s
                </div>
                {isB && (
                  <div className="absolute inset-x-0 flex justify-center" style={{ bottom: `calc(${y(mean)} + 20px)` }}>
                    <span className="whitespace-nowrap rounded bg-critical-bg px-1.5 py-0.5 text-[10px] font-semibold text-critical-ink">Bottleneck</span>
                  </div>
                )}
                <div className={clsx('yz-bar flex flex-col-reverse overflow-hidden rounded-t-[3px]', isB && 'ring-2 ring-critical/60 ring-offset-1')} style={{ height: y(mean) }}>
                  {stats && SEGMENTS.map(s => (
                    <div key={s.key} className={clsx(s.cls, 'border-t border-white/70 first:border-t-0')} style={{ height: `${(stats.segments[s.key] / mean) * 100}%` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {/* takt line */}
        <div className="yz-scan pointer-events-none absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-brand to-transparent shadow-[0_0_12px_2px_rgba(42,120,214,0.35)]" aria-hidden />
        <div className="yz-takt pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-ink/70" style={{ bottom: y(line.taktSec) }}>
          <span className="tnum absolute -top-[9px] left-full ml-1.5 whitespace-nowrap rounded bg-ink px-1.5 py-px text-[10px] font-medium text-white">Takt {line.taktSec}s</span>
        </div>
      </div>
      <div className="mr-14 ml-7 flex justify-around gap-2 px-1 pt-2 sm:gap-4">
        {rows.map(({ station }) => (
          <div key={station.id} className="w-full max-w-[52px] text-center font-mono text-[10.5px] text-ink-2">{station.name}</div>
        ))}
      </div>
    </figure>
  );
}

/** Real cycle completions from the server, popping in over the product window. */
function CycleToast({ view }: { view: LineView }) {
  const ref = useRef<HTMLDivElement>(null);
  const [c, setC] = useState<Cycle | null>(null);
  const last = useRef(0);
  useRealtime(m => {
    if (m.kind !== 'cycle' || !view.stations.some(s => s.id === m.cycle.stationId)) return;
    const now = Date.now(); if (now - last.current < 2600) return; // keep it calm
    last.current = now; setC(m.cycle);
  });
  useGSAP(() => {
    if (!c || !ref.current) return;
    gsap.timeline()
      .fromTo(ref.current, { autoAlpha: 0, y: 14, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.8)' })
      .to(ref.current, { autoAlpha: 0, y: -8, duration: 0.4, ease: 'power2.in' }, '+=1.7');
  }, { dependencies: [c?.id] });
  if (!c) return null;
  const st = view.stations.find(s => s.id === c.stationId);
  const over = c.duration > view.line.taktSec;
  return (
    <div ref={ref} className="pointer-events-none absolute -bottom-4 right-4 z-10 flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 text-[12px] opacity-0 shadow-pop sm:right-8" aria-live="off">
      <CheckCircle2 size={14} className={over ? 'text-serious' : 'text-good'} />
      <span className="font-medium">{st?.name} cycle</span>
      <span className={clsx('tnum font-semibold', over ? 'text-serious-ink' : 'text-ink')}>{c.duration.toFixed(1)}s</span>
      <span className="text-muted">· just now</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="p-4 sm:p-6" aria-busy="true" aria-label="Loading live line data">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[86px]" />)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-[200px] lg:h-[262px]" />
        <Skeleton className="h-[200px] lg:h-[262px]" />
      </div>
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
