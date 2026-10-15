import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Lightbulb, Video } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, Kpi, PageHeader, SeverityBadge, SimBadge, Skeleton, Segmented, Empty } from '../../components/ui.tsx';
import { ThroughputChart } from '../../components/charts.tsx';
import { StationFlow } from '../../components/StationFlow.tsx';
import { useLiveStations, useResource, type Alert, type PlantView } from '../../lib/api.ts';
import { ago, num, pct } from '../../lib/format.ts';

export default function Overview() {
  const { data } = useResource<PlantView>('/api/plant', { every: 15_000, on: ['cycle'] });
  const { data: alerts } = useResource<Alert[]>('/api/alerts?limit=6', { on: ['alert'] });
  const { live } = useLiveStations();
  const [tpLine, setTpLine] = useState('l1');

  if (!data) return <OverviewSkeleton />;
  const prod = data.lines.filter(l => l.line.source === 'sim' && l.metrics.units > 0); // plant KPIs: production lines only
  const units = prod.reduce((s, l) => s + l.metrics.units, 0);
  const target = prod.reduce((s, l) => s + l.metrics.hourly.reduce((a, h) => a + h.target, 0), 0);
  const oee = units ? prod.reduce((s, l) => s + l.metrics.oee * l.metrics.units, 0) / units : 0;
  const onTarget = prod.filter(l => l.metrics.uph >= l.metrics.targetUph * 0.98).length;
  const recs = prod.flatMap(l => l.metrics.recommendations.filter(r => r.kind !== 'capacity').slice(0, 1).map(r => ({ ...r, line: l.line })));
  const tp = data.lines.find(l => l.line.id === tpLine) ?? data.lines[0];

  return (
    <>
      <PageHeader
        eyebrow={`${data.plant.name} · Shift B`}
        title="Plant overview"
        subtitle="Live cycle-time intelligence from every station camera across the plant."
        actions={<><Button to="/app/alerts" variant="secondary"><Bell size={15} />Alerts</Button><Button to="/app/live" variant="dark"><Video size={15} />Live cell</Button></>}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Plant OEE" value={pct(oee, 1)} sub="availability × performance × quality" />
        <Kpi label="Units this shift" value={num(units)} delta={{ text: `${units >= target ? '+' : ''}${num(units - target)} vs plan`, good: units >= target }} sub={`plan ${num(target)}`} />
        <Kpi label="Lines on target" value={`${onTarget}`} unit={`of ${prod.length}`} sub="actual units/hr ≥ takt rate" />
        <Kpi label="Open alerts" value={data.openAlerts} tone={data.openAlerts ? 'critical' : undefined} sub="bottlenecks, over-takt, micro-stops" />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-tight">Lines</h2>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        {data.lines.map(({ line, stations, metrics: m }) => {
          const b = stations.find(s => s.id === m.bottleneckId);
          const behind = m.uph < m.targetUph * 0.98;
          return (
            <Card key={line.id} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/app/lines/${line.id}`} className="text-[15px] font-semibold tracking-tight hover:underline">{line.name}</Link>
                    {line.source === 'sim' ? <SimBadge /> : <Badge tone="brand">Live camera</Badge>}
                    {line.source === 'sim' && m.units > 0 && (behind ? <Badge tone="critical">Behind plan</Badge> : <Badge tone="good">On plan</Badge>)}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">{line.product} · takt {line.taktSec}s</div>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-2">
                  <Stat label="OEE" value={m.units ? pct(m.oee, 1) : '—'} />
                  <Stat label="Units / hr" value={m.units ? <>{num(m.uph, 1)}<span className="text-muted font-normal text-[13px]"> / {num(m.targetUph)}</span></> : '—'} />
                  <Stat label="Line balance" value={m.units ? pct(m.balanceEfficiency) : '—'} />
                  <Stat label="Bottleneck" value={b?.name ?? '—'} />
                  <Button to={`/app/lines/${line.id}`} variant="ghost" size="sm" className="self-center">Open <ArrowRight size={14} /></Button>
                </div>
              </div>
              <div className="px-5 pb-5 pt-4">
                {m.units > 0 || line.source !== 'sim'
                  ? <StationFlow stations={stations} stats={m.stations} live={live} takt={line.taktSec} bottleneckId={m.bottleneckId} compact />
                  : null}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Hourly output vs plan" subtitle={tp.line.name}
            action={<Segmented value={tpLine} onChange={setTpLine} options={prod.map(l => ({ value: l.line.id, label: l.line.name.split(' · ')[0] }))} />} />
          <div className="px-3 pb-4 pt-4"><ThroughputChart data={tp.metrics.hourly} /></div>
        </Card>
        <Card className="flex flex-col">
          <CardHeader title="Recommended actions" subtitle="Generated from this shift's cycle data" />
          <div className="flex flex-1 flex-col gap-3 p-5">
            {recs.map(r => (
              <Link key={r.id} to={`/app/lines/${r.line.id}`} className="group rounded-xl border border-line p-4 transition-colors hover:border-axis">
                <div className="flex items-center gap-2 text-[12px] text-muted"><Lightbulb size={13} className="text-brand" />{r.line.name.split(' · ')[0]}</div>
                <div className="mt-1.5 text-[14px] font-medium leading-snug">{r.title}</div>
                <div className="mt-2 text-[12.5px] font-medium text-good-ink">{r.impact}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Latest alerts" action={<Button to="/app/alerts" variant="ghost" size="sm">View all <ArrowRight size={14} /></Button>} />
        <div className="mt-3">
          {!alerts?.length ? <Empty icon={<Bell size={18} />} title="No alerts">Everything is running to takt.</Empty> :
            alerts.map(a => (
              <div key={a.id} className="flex items-start gap-4 border-t border-line px-5 py-3.5">
                <div className="w-[88px] shrink-0 pt-0.5"><SeverityBadge severity={a.severity} /></div>
                <div className="min-w-0 flex-1 text-[13.5px]">{a.message}</div>
                <div className="shrink-0 text-[12px] text-muted tnum">{ago(a.ts)}</div>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tracking-tight tnum">{value}</div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[118px]" />)}</div>
      {[0, 1].map(i => <Skeleton key={i} className="h-48" />)}
    </div>
  );
}
