import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { StationStats } from '@shared/analytics.ts';
import type { Station, StationLive } from '@shared/types.ts';
import { useRef } from 'react';
import { useNow, useRealtime } from '../lib/api.ts';
import { ping } from '../lib/motion.ts';
import { StatusPill } from './ui.tsx';

const PHASE: Record<StationLive['phase'], string> = { idle: 'Waiting for part', pick: 'Picking', work: 'Working', place: 'Placing' };

/** Live station-by-station flow of a line: status, current cycle timer vs takt, mean cycle. */
export function StationFlow({ stations, stats, live, takt, bottleneckId, selected, onSelect, compact }: {
  stations: Station[]; stats: StationStats[]; live: Map<string, StationLive> | (StationLive | null)[]; takt: number;
  bottleneckId: string | null; selected?: string | null; onSelect?: (id: string) => void; compact?: boolean;
}) {
  const now = useNow(200);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  // a station that just finished a cycle flashes: green on takt, orange over takt
  useRealtime(m => {
    if (m.kind !== 'cycle') return;
    ping(cards.current.get(m.cycle.stationId) ?? null, m.cycle.duration > takt ? 'rgba(236,131,90,0.6)' : 'rgba(12,163,12,0.45)');
  });
  const liveOf = (id: string) => (live instanceof Map ? live.get(id) : live.find(l => l?.stationId === id)) ?? null;
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {stations.map((s, i) => {
        const st = stats.find(x => x.stationId === s.id);
        const l = liveOf(s.id);
        const el = l?.cycleStartedAt ? (now - l.cycleStartedAt) / 1000 : 0;
        const frac = Math.min(1, el / takt);
        const over = el > takt;
        const isB = s.id === bottleneckId;
        return (
          <div key={s.id} className="flex min-w-0 flex-1 items-center gap-1.5">
            <button ref={el => { if (el) cards.current.set(s.id, el); else cards.current.delete(s.id); }} onClick={() => onSelect?.(s.id)}
              className={clsx('min-w-[148px] flex-1 rounded-xl border bg-surface text-left transition-all',
                compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
                selected === s.id ? 'border-ink shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line hover:border-axis',
                onSelect ? 'cursor-pointer' : 'cursor-default')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{s.name}</span>
                {isB ? <span className="text-[11px] font-medium text-critical-ink">▲ Bottleneck</span> : l && <StatusPill status={l.status} />}
              </div>
              {!compact && <div className="mt-0.5 truncate text-[12px] text-muted">{s.operation}</div>}
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className={clsx('text-[20px] font-semibold tracking-tight tnum', over && 'text-serious-ink')}>
                  {l?.cycleStartedAt ? `${el.toFixed(1)}s` : '—'}
                </span>
                <span className="text-[11.5px] text-muted tnum">avg {st?.count ? `${st.mean.toFixed(1)}s` : '—'}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken">
                <div className={clsx('h-full rounded-full transition-[width] duration-200', over ? 'bg-serious' : 'bg-brand')} style={{ width: `${frac * 100}%` }} />
              </div>
              <div className="mt-1.5 text-[11.5px] text-ink-2">{l ? PHASE[l.phase] : 'No signal'}</div>
            </button>
            {i < stations.length - 1 && <ChevronRight size={14} className="shrink-0 text-axis" />}
          </div>
        );
      })}
    </div>
  );
}
