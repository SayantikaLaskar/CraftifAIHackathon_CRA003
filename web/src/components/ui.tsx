import clsx from 'clsx';
import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { enter, tweenNumber } from '../lib/motion.ts';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Clock, Info, WifiOff } from 'lucide-react';
import type { Severity, StationStatus } from '@shared/types.ts';

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill={dark ? '#fff' : '#0b0b0b'} />
        <rect x="7" y="17" width="4" height="8" rx="1.5" fill={dark ? '#0b0b0b' : '#fff'} opacity=".5" />
        <rect x="14" y="11" width="4" height="14" rx="1.5" fill={dark ? '#0b0b0b' : '#fff'} />
        <rect x="21" y="14" width="4" height="11" rx="1.5" fill={dark ? '#0b0b0b' : '#fff'} opacity=".5" />
        <rect x="5" y="8" width="22" height="2" rx="1" fill="#2a78d6" />
      </svg>
      <span className="text-[17px]">Takt</span>
    </span>
  );
}

type BtnProps = { variant?: 'primary' | 'secondary' | 'ghost' | 'dark'; size?: 'sm' | 'md' | 'lg'; to?: string } & ComponentProps<'button'>;
export function Button({ variant = 'secondary', size = 'md', to, className, children, ...rest }: BtnProps) {
  const cls = clsx(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-3.5 text-sm', lg: 'h-11 px-5 text-[15px]' }[size],
    {
      primary: 'bg-brand text-white hover:bg-brand-600',
      secondary: 'bg-surface text-ink shadow-[0_0_0_1px_rgba(11,11,11,0.1)] hover:bg-sunken',
      ghost: 'text-ink-2 hover:text-ink hover:bg-sunken',
      dark: 'bg-ink text-white hover:bg-[#222]',
    }[variant],
    className,
  );
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => enter(ref.current), []);
  return <div ref={ref} className={clsx('card', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'good' | 'warning' | 'serious' | 'critical'; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4', {
      neutral: 'bg-sunken text-ink-2',
      brand: 'bg-brand-50 text-brand-700',
      good: 'bg-good-bg text-good-ink',
      warning: 'bg-warning-bg text-warning-ink',
      serious: 'bg-serious-bg text-serious-ink',
      critical: 'bg-critical-bg text-critical-ink',
    }[tone], className)}>{children}</span>
  );
}

export function SimBadge() {
  return <Badge tone="neutral" className="font-normal"><CircleDashed size={11} /> Simulated feed</Badge>;
}

export function LiveDot({ on = true, className }: { on?: boolean; className?: string }) {
  return <span className={clsx('inline-block size-2 rounded-full', on ? 'bg-good live-dot' : 'bg-axis', className)} />;
}

const STATUS: Record<StationStatus, { label: string; tone: 'good' | 'warning' | 'serious' | 'neutral'; Icon: typeof CheckCircle2 }> = {
  running: { label: 'On takt', tone: 'good', Icon: CheckCircle2 },
  over: { label: 'Over takt', tone: 'serious', Icon: AlertTriangle },
  idle: { label: 'Waiting', tone: 'warning', Icon: Clock },
  offline: { label: 'Offline', tone: 'neutral', Icon: WifiOff },
};
export function StatusPill({ status }: { status: StationStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}><s.Icon size={12} strokeWidth={2.25} />{s.label}</Badge>;
}

const SEV: Record<Severity, { label: string; Icon: typeof Info }> = {
  warning: { label: 'Warning', Icon: Info },
  serious: { label: 'Serious', Icon: AlertTriangle },
  critical: { label: 'Critical', Icon: AlertOctagon },
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  return <Badge tone={severity}><s.Icon size={12} strokeWidth={2.25} />{s.label}</Badge>;
}

export function Kpi({ label, value, unit, sub, delta, tone }: {
  label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode;
  delta?: { text: string; good: boolean }; tone?: 'critical' | 'good';
}) {
  // numbers count up on first mount and glide when they change
  const valRef = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  useLayoutEffect(() => {
    const m = typeof value === 'string' || typeof value === 'number' ? String(value).match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/) : null;
    if (!m) return;
    const n = parseFloat(m[2].replace(/,/g, '')), dec = m[2].split('.')[1]?.length ?? 0, grouped = m[2].includes(',');
    const fmt = (v: number) => `${m[1]}${grouped ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec)}${m[3]}`;
    if (prev.current !== n) tweenNumber(valRef.current, prev.current ?? 0, n, fmt, prev.current === null ? 1.1 : 0.6);
    prev.current = n;
  }, [value]);
  return (
    <Card className="px-5 py-4.5">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span ref={valRef} className={clsx('text-[30px] font-semibold tracking-tight leading-none', tone === 'critical' && 'text-critical-ink')}>{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-muted">
        {delta && <span className={clsx('font-medium', delta.good ? 'text-good-ink' : 'text-critical-ink')}>{delta.text}</span>}
        {sub}
      </div>
    </Card>
  );
}

export function Meter({ value, target, className }: { value: number; target?: number; className?: string }) {
  return (
    <div className={clsx('relative h-1.5 rounded-full bg-sunken', className)}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${Math.min(100, value * 100)}%` }} />
      {target !== undefined && <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-brand" style={{ left: `${target * 100}%` }} />}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 grid size-10 place-items-center rounded-full bg-sunken text-ink-2">{icon}</div>
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-sunken', className)} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-sunken p-0.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={clsx('h-7 whitespace-nowrap rounded-md px-2.5 text-[12.5px] font-medium transition-colors', value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
