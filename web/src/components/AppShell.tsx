import clsx from 'clsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, Cpu, Factory, LayoutDashboard, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LiveDot, Logo } from './ui.tsx';
import { STANDALONE, useLiveStations, useResource, type PlantView } from '../lib/api.ts';
import AlertToaster from './AlertToaster.tsx';
import { duration } from '../lib/format.ts';

function Item({ to, icon: Icon, children, end, count }: { to: string; icon: typeof Bell; children: React.ReactNode; end?: boolean; count?: number }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => clsx('group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
        isActive ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:bg-sunken hover:text-ink')}>
      <Icon size={16} strokeWidth={2} className="shrink-0" />
      <span className="flex-1 truncate">{children}</span>
      {!!count && <span className="rounded-full bg-critical px-1.5 text-[11px] font-semibold leading-[18px] text-white tnum">{count}</span>}
    </NavLink>
  );
}

export default function AppShell() {
  const { data } = useResource<PlantView>('/api/plant', { every: 10_000, on: ['alert'] });
  const { connected } = useLiveStations();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-screen bg-page lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-page px-3 py-4 lg:flex">
        <NavLink to="/" className="px-2.5 pb-5 pt-1"><Logo /></NavLink>
        <div className="mb-4 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Plant</div>
          <div className="mt-0.5 flex items-center justify-between text-[13.5px] font-medium">
            {data?.plant.name ?? '—'}
          </div>
          <div className="text-[12px] text-muted">{data?.plant.company}</div>
        </div>
        <nav className="flex flex-col gap-0.5">
          <Item to="/app" end icon={LayoutDashboard}>Overview</Item>
          <div className="eyebrow px-2.5 pb-1.5 pt-4">Lines</div>
          {data?.lines.map(l => (
            <Item key={l.line.id} to={`/app/lines/${l.line.id}`} icon={Factory}>{l.line.name.split(' · ')[0]}<span className="text-muted font-normal"> · {l.line.name.split(' · ')[1]}</span></Item>
          ))}
          <div className="eyebrow px-2.5 pb-1.5 pt-4">Operate</div>
          <Item to="/app/live" icon={Video}>Live cell</Item>
          <Item to="/app/alerts" icon={Bell} count={data?.openAlerts}>Alerts</Item>
          <Item to="/app/edge" icon={Cpu}>Edge &amp; PipeGen</Item>
        </nav>
        <div className="mt-auto rounded-lg px-2.5 py-2 text-[12px] text-muted">
          <div className="flex items-center gap-2"><LiveDot on={connected} />{connected ? 'Streaming live' : 'Reconnecting…'}</div>
          {data && <div className="mt-1">Shift B · running {duration(now - data.shiftStart)}</div>}
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center gap-3 overflow-x-auto border-b border-line bg-page/90 px-4 py-3 backdrop-blur lg:hidden">
        <NavLink to="/"><Logo /></NavLink>
        <nav className="ml-auto flex gap-1 text-[13px]">
          {[['/app', 'Overview'], ['/app/live', 'Live'], ['/app/alerts', 'Alerts'], ['/app/edge', 'Edge']].map(([to, l]) => (
            <NavLink key={to} to={to} end className={({ isActive }) => clsx('rounded-md px-2 py-1', isActive ? 'bg-surface shadow-card' : 'text-ink-2')}>{l}</NavLink>
          ))}
        </nav>
      </div>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-[1280px]">
          {STANDALONE && (
            <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-100 bg-brand-50/60 px-3.5 py-2 text-[12.5px] text-brand-700">
              <span className="font-medium">Hosted demo.</span>
              <span className="text-ink-2">The plant runtime and simulator run in your browser. Clone the repo and run <code className="font-mono">npm start</code> to connect real PipeGen edge devices.</span>
            </div>
          )}
          <Outlet />
        </div>
      </main>
      <AlertToaster />
    </div>
  );
}
