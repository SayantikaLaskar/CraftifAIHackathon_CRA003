import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRightLeft, Download, Gauge, Lightbulb, Ruler, Timer } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Empty, Kpi, PageHeader, SimBadge, Skeleton } from '../../components/ui.tsx';
import { Histogram, Legend, SEGMENTS, SERIES, TrendChart, Yamazumi } from '../../components/charts.tsx';
import { StationFlow } from '../../components/StationFlow.tsx';
import { api, useLiveStations, useRealtime, useResource, type Cycle, type LineView } from '../../lib/api.ts';
import { num, pct, sec, timeS } from '../../lib/format.ts';
import { gsap, useGSAP } from '../../lib/motion.ts';
import { useRef } from 'react';

const REC_ICON = { capacity: Gauge, rebalance: ArrowRightLeft, standardise: Ruler, microstops: Timer } as const;

export default function LinePage() {
  const { id = 'l1' } = useParams();
  const { data, reload } = useResource<LineView>(`/api/lines/${id}`, { every: 20_000, on: ['cycle'] });
  const { live } = useLiveStations();
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => setSel(null), [id]);

  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-96" /><Skeleton className="h-28" /><Skeleton className="h-80" /></div>;
  const { line, stations, metrics: m } = data;
  const station = stations.find(s => s.id === (sel ?? m.bottleneckId)) ?? stations[0];
  const hasData = m.stations.some(s => s.count);

  return (
    <>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2">{line.product}{line.source === 'sim' && <SimBadge />}</span>}
        title={line.name}
        subtitle={`Takt ${line.taktSec}s · ideal cycle ${line.idealCycleSec}s · ${stations.length} station${stations.length > 1 ? 's' : ''}`}
        actions={<>
          <TaktEditor lineId={line.id} value={line.taktSec} onSaved={reload} />
          <Button onClick={() => exportCsv(line.name, stations, m)} disabled={!hasData}><Download size={15} />Export</Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="OEE" value={hasData ? pct(m.oee, 1) : '—'} sub={hasData ? `A ${pct(m.availability)} · P ${pct(m.performance)} · Q ${pct(m.quality, 1)}` : 'no cycles yet'} />
        <Kpi label="Units / hr" value={num(m.uph, 1)} delta={hasData ? { text: `${m.uph >= m.targetUph ? '+' : ''}${num(m.uph - m.targetUph, 1)}`, good: m.uph >= m.targetUph } : undefined} sub={`target ${num(m.targetUph)}`} />
        <Kpi label="Capacity" value={hasData ? num(m.capacityUph, 1) : '—'} unit="u/hr" sub="limited by bottleneck" />
        <Kpi label="Line balance" value={hasData ? pct(m.balanceEfficiency) : '—'} sub="Σ time ÷ (n × slowest)" />
        <Kpi label="Takt adherence" value={hasData ? pct(m.taktAdherence) : '—'} sub="cycles finished within takt" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Live station flow" subtitle="Current cycle timer per station. Select a station to drill in." />
        <div className="p-5 pt-4">
          <StationFlow stations={stations} stats={m.stations} live={live} takt={line.taktSec} bottleneckId={m.bottleneckId} selected={station.id} onSelect={setSel} />
        </div>
      </Card>

      {!hasData ? (
        <Card className="mt-4"><Empty icon={<Gauge size={18} />} title="Waiting for the first cycles">
          Cycles appear here as soon as the station camera reports them. For this line, open the Live cell and start the camera.
        </Empty></Card>
      ) : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Line balance (Yamazumi)" subtitle="Average work content per station, stacked by element, against takt"
                action={<Legend items={[...SEGMENTS.map(s => ({ label: s.label, color: s.color })), { label: 'Takt', color: 'var(--color-critical)', dashed: true }]} />} />
              <div className="px-4 pb-3 pt-2">
                <Yamazumi stations={stations} stats={m.stations} takt={line.taktSec} bottleneckId={m.bottleneckId} highlight={sel} onSelect={setSel} height={320} />
              </div>
            </Card>
            <Card className="flex flex-col">
              <CardHeader title="Recommendations" subtitle="Ranked by expected impact" />
              <div className="flex flex-1 flex-col gap-3 p-5">
                {m.recommendations.length === 0 && <Empty icon={<Lightbulb size={18} />} title="Line is well balanced">No actions recommended right now.</Empty>}
                {m.recommendations.map((r, i) => {
                  const Icon = REC_ICON[r.kind];
                  return (
                    <div key={r.id} className={clsx('rounded-xl border p-4', i === 0 ? 'border-brand-100 bg-brand-50/50' : 'border-line')}>
                      <div className="flex items-start gap-3">
                        <div className={clsx('grid size-7 shrink-0 place-items-center rounded-lg', i === 0 ? 'bg-brand text-white' : 'bg-sunken text-ink-2')}><Icon size={14} /></div>
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold leading-snug">{r.title}</div>
                          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{r.detail}</p>
                          <div className="mt-2.5"><Badge tone={r.kind === 'capacity' ? 'critical' : 'good'}>{r.impact}</Badge></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Cycle time trend" subtitle="10-minute rolling mean per station"
              action={<Legend items={[...stations.map((s, i) => ({ label: s.name, color: SERIES[i] })), { label: 'Takt', color: 'var(--color-critical)', dashed: true }]} />} />
            <div className="px-3 pb-4 pt-3"><TrendChart data={m.trend} stations={stations} takt={line.taktSec} focus={sel} /></div>
          </Card>

          <StationDetail key={station.id} lineView={data} stationId={station.id} />

          <Card className="mt-4 overflow-hidden">
            <CardHeader title="Station statistics" subtitle="This shift" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[13px] tnum">
                <thead>
                  <tr className="border-y border-line bg-surface-2 text-left text-[12px] text-muted">
                    {['Station', 'Operation', 'Cycles', 'Mean', 'Median', 'P90', 'CV', 'On takt', 'Micro-stop', ''].map(h => <th key={h} className="whitespace-nowrap px-5 py-2.5 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stations.map(s => {
                    const st = m.stations.find(x => x.stationId === s.id)!;
                    return (
                      <tr key={s.id} onClick={() => setSel(s.id)} className={clsx('cursor-pointer border-b border-line last:border-0 hover:bg-surface-2', station.id === s.id && 'bg-surface-2')}>
                        <td className="px-5 py-3 font-semibold">{s.name}</td>
                        <td className="px-5 py-3 text-ink-2">{s.operation}</td>
                        <td className="px-5 py-3">{num(st.count)}</td>
                        <td className={clsx('px-5 py-3 font-medium', st.mean > line.taktSec && 'text-critical-ink')}>{sec(st.mean)}</td>
                        <td className="px-5 py-3">{sec(st.median)}</td>
                        <td className="px-5 py-3">{sec(st.p90)}</td>
                        <td className={clsx('px-5 py-3', st.cv > 0.18 && 'text-serious-ink font-medium')}>{pct(st.cv)}</td>
                        <td className="px-5 py-3">{pct(st.onTaktPct)}</td>
                        <td className="px-5 py-3">{pct(st.wastePct, 1)}</td>
                        <td className="px-5 py-3 text-right">{s.id === m.bottleneckId && <Badge tone="critical">Bottleneck</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function StationDetail({ lineView, stationId }: { lineView: LineView; stationId: string }) {
  const { line, stations, metrics: m } = lineView;
  const s = stations.find(x => x.id === stationId)!;
  const st = m.stations.find(x => x.stationId === stationId)!;
  const { data: bins } = useResource<{ from: number; to: number; count: number }[]>(`/api/stations/${stationId}/histogram`, { every: 30_000 });
  const { data: initial } = useResource<Cycle[]>(`/api/stations/${stationId}/cycles?limit=10`);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => { if (initial) setCycles(initial); }, [initial]);
  const tbody = useRef<HTMLTableSectionElement>(null);
  useGSAP(() => { // a freshly streamed cycle slides into the top of the table
    const row = fresh ? tbody.current?.querySelector(`[data-id="${fresh}"]`) : null;
    if (row) gsap.from(row.children, { y: -10, autoAlpha: 0, duration: 0.45, ease: 'power3.out', stagger: 0.02 });
  }, { dependencies: [fresh] });
  useRealtime(msg => {
    if (msg.kind === 'cycle' && msg.cycle.stationId === stationId) {
      setCycles(c => [msg.cycle, ...c].slice(0, 10)); setFresh(msg.cycle.id);
    }
  });

  const facts = useMemo(() => [
    ['Median', sec(st.median)], ['P90', sec(st.p90)], ['Best', sec(st.min)], ['Variation (CV)', pct(st.cv)],
    ['On takt', pct(st.onTaktPct)], ['Micro-stop share', pct(st.wastePct, 1)],
  ], [st]);

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader title={<>{s.name} <span className="font-normal text-muted">· {s.operation}</span></>} subtitle="Cycle-time distribution this shift" />
        <div className="grid grid-cols-3 gap-px overflow-hidden border-y border-line bg-line mt-4">
          {facts.map(([k, v]) => (
            <div key={k} className="bg-surface px-5 py-3">
              <div className="text-[12px] text-muted">{k}</div>
              <div className="mt-0.5 text-[15px] font-semibold tnum">{v}</div>
            </div>
          ))}
        </div>
        <div className="px-3 pb-4 pt-4">{bins ? <Histogram bins={bins} takt={line.taktSec} median={st.median} /> : <Skeleton className="mx-2 h-[200px]" />}</div>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Recent cycles" subtitle="Streaming from the station camera" />
        <table className="mt-3 w-full text-[13px] tnum">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-left text-[12px] text-muted">
              {['Finished', 'Cycle', 'Work', 'Pick', 'Place', 'Stop'].map(h => <th key={h} className="px-4 py-2.5 font-medium first:pl-5">{h}</th>)}
            </tr>
          </thead>
          <tbody ref={tbody}>
            {cycles.map(c => (
              <tr key={c.id} data-id={c.id} className={clsx('border-b border-line last:border-0', fresh === c.id && 'flash-in')}>
                <td className="px-4 py-2.5 pl-5 text-ink-2">{timeS(c.end)}</td>
                <td className={clsx('px-4 py-2.5 font-semibold', c.duration > line.taktSec && 'text-critical-ink')}>{sec(c.duration)}</td>
                <td className="px-4 py-2.5">{sec(c.work)}</td>
                <td className="px-4 py-2.5">{sec(c.pick)}</td>
                <td className="px-4 py-2.5">{sec(c.place)}</td>
                <td className="px-4 py-2.5">{c.waste > 0 ? <span className="text-warning-ink">{sec(c.waste, 0)}</span> : <span className="text-muted">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TaktEditor({ lineId, value, onSaved }: { lineId: string; value: number; onSaved: () => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const dirty = Number(v) !== value && Number(v) > 1;
  return (
    <label className="flex h-9 items-center gap-2 rounded-lg bg-surface pl-3 pr-1 text-[13px] text-ink-2 shadow-[0_0_0_1px_rgba(11,11,11,0.1)]">
      Takt
      <input value={v} onChange={e => setV(e.target.value.replace(/[^\d.]/g, ''))} className="w-10 bg-transparent text-right font-semibold text-ink outline-none tnum" aria-label="Takt time in seconds" />
      <span className="text-muted">s</span>
      <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} className="h-7"
        onClick={async () => { await api(`/api/lines/${lineId}`, { method: 'PUT', body: JSON.stringify({ taktSec: Number(v) }) }); onSaved(); }}>Save</Button>
    </label>
  );
}

function exportCsv(name: string, stations: LineView['stations'], m: LineView['metrics']) {
  const head = 'station,operation,cycles,mean_s,median_s,p90_s,cv,on_takt,work_s,pick_s,place_s,microstop_s';
  const rows = stations.map(s => {
    const st = m.stations.find(x => x.stationId === s.id)!;
    return [s.name, `"${s.operation}"`, st.count, st.mean, st.median, st.p90, st.cv, st.onTaktPct.toFixed(3), st.segments.work, st.segments.pick, st.segments.place, st.segments.waste].join(',');
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head, ...rows].join('\n')], { type: 'text/csv' }));
  a.download = `${name.replace(/\W+/g, '-').toLowerCase()}-time-study.csv`; a.click();
}
