import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bell, Check } from 'lucide-react';
import { Button, Card, Empty, PageHeader, Segmented, SeverityBadge, Skeleton } from '../../components/ui.tsx';
import { api, useResource, type Alert, type PlantView } from '../../lib/api.ts';
import { ago, timeS } from '../../lib/format.ts';

const TYPE_LABEL: Record<Alert['type'], string> = {
  BOTTLENECK: 'Bottleneck', OVER_TAKT: 'Over takt', MICROSTOP: 'Micro-stop', IDLE: 'Idle', OFFLINE: 'Camera offline',
};

export default function Alerts() {
  const { data, reload } = useResource<Alert[]>('/api/alerts?limit=300', { on: ['alert'] });
  const { data: plant } = useResource<PlantView>('/api/plant');
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [sev, setSev] = useState<'all' | Alert['severity']>('all');

  const names = useMemo(() => {
    const m = new Map<string, string>();
    plant?.lines.forEach(l => { m.set(l.line.id, l.line.name); l.stations.forEach(s => m.set(s.id, s.name)); });
    return m;
  }, [plant]);

  const rows = (data ?? []).filter(a => (filter === 'all' || !a.acked) && (sev === 'all' || a.severity === sev));
  const counts = { critical: 0, serious: 0, warning: 0 } as Record<Alert['severity'], number>;
  (data ?? []).filter(a => !a.acked).forEach(a => counts[a.severity]++);

  const ack = async (ids: string[]) => { await Promise.all(ids.map(id => api(`/api/alerts/${id}/ack`, { method: 'POST' }))); reload(); };

  return (
    <>
      <PageHeader title="Alerts" subtitle="Raised automatically from cycle data: bottleneck shifts, over-takt streaks, micro-stops and offline cameras."
        actions={<Button onClick={() => ack(rows.filter(a => !a.acked).map(a => a.id))} disabled={!rows.some(a => !a.acked)}><Check size={15} />Acknowledge all shown</Button>} />

      <div className="mb-4 grid grid-cols-3 gap-4">
        {(['critical', 'serious', 'warning'] as const).map(s => (
          <button key={s} onClick={() => setSev(sev === s ? 'all' : s)} className={clsx('card px-5 py-4 text-left transition-shadow', sev === s && 'shadow-[0_0_0_1.5px_var(--color-ink)]')}>
            <SeverityBadge severity={s} />
            <div className="mt-2 text-[26px] font-semibold tracking-tight tnum">{counts[s]}</div>
            <div className="text-[12px] text-muted">open</div>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
          <span className="text-[12.5px] text-muted tnum">{rows.length} alert{rows.length === 1 ? '' : 's'}</span>
        </div>
        {!data ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div> :
          rows.length === 0 ? <Empty icon={<Bell size={18} />} title="All clear">No alerts match this filter.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-surface-2 text-left text-[12px] text-muted">
                    {['Severity', 'Type', 'Where', 'Detail', 'When', ''].map(h => <th key={h} className="whitespace-nowrap px-5 py-2.5 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 150).map(a => (
                    <tr key={a.id} className={clsx('border-b border-line last:border-0', a.acked && 'text-muted')}>
                      <td className="px-5 py-3"><SeverityBadge severity={a.severity} /></td>
                      <td className="whitespace-nowrap px-5 py-3 font-medium">{TYPE_LABEL[a.type]}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-ink-2">{names.get(a.lineId)?.split(' · ')[0]}{a.stationId && <> · {names.get(a.stationId)}</>}</td>
                      <td className="min-w-[320px] px-5 py-3">{a.message}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-ink-2 tnum" title={timeS(a.ts)}>{ago(a.ts)}</td>
                      <td className="px-5 py-3 text-right">{a.acked ? <span className="inline-flex items-center gap-1 text-[12px]"><Check size={13} />Acked</span>
                        : <Button size="sm" onClick={() => ack([a.id])}>Acknowledge</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}
