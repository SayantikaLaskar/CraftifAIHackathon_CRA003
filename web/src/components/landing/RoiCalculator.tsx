import { useId, useRef, useState } from 'react';
import { gsap, useGSAP } from '../../lib/motion.ts';

const WORKING_DAYS = 300;

/** ₹ with Indian units: crore above 1e7, lakh above 1e5. */
export function inr(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e9 ? 0 : n >= 1e8 ? 1 : 2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function RoiCalculator() {
  const [units, setUnits] = useState(600);
  const [margin, setMargin] = useState(1800);
  const [lines, setLines] = useState(4);
  const [gain, setGain] = useState(8);

  const extraUnits = units * lines * (gain / 100) * WORKING_DAYS;
  const value = extraUnits * margin;
  const perLine = lines > 0 ? value / lines : 0;

  // the headline figure glides between values instead of jumping
  const out = useRef<HTMLOutputElement>(null);
  const shown = useRef({ v: value });
  useGSAP(() => {
    const node = out.current?.firstChild as Text | null;
    if (!node) return;
    node.nodeValue = inr(shown.current.v); // runs before paint: show the previous value, then glide
    gsap.to(shown.current, {
      v: value, duration: 0.6, ease: 'power3.out', overwrite: true,
      onUpdate: () => { node.nodeValue = inr(shown.current.v); },
    });
  }, { dependencies: [value] });

  return (
    <div className="grid overflow-hidden rounded-xl bg-surface shadow-card lg:grid-cols-[1.1fr_1fr]">
      <form className="grid gap-6 p-6 sm:p-8" onSubmit={e => e.preventDefault()} aria-label="ROI inputs">
        <div className="grid gap-6 sm:grid-cols-2">
          <NumberField label="Line output" suffix="units / day" value={units} onChange={setUnits} min={0} step={50} />
          <NumberField label="Contribution margin" prefix="₹" suffix="per unit" value={margin} onChange={setMargin} min={0} step={100} />
          <NumberField label="Lines" suffix="assembly lines" value={lines} onChange={setLines} min={1} step={1} />
          <div>
            <div className="text-[13px] font-medium text-ink">Working days</div>
            <div className="mt-2 flex h-11 items-center rounded-lg bg-sunken px-3 text-[15px] font-medium text-ink-2">
              <span className="tnum">{WORKING_DAYS}</span><span className="ml-auto text-[12.5px] font-normal text-muted">per year</span>
            </div>
          </div>
        </div>
        <Slider label="Capacity unlocked by rebalancing" value={gain} onChange={setGain} min={3} max={20} />
      </form>

      <div className="flex flex-col justify-between gap-8 border-t border-line bg-surface-2 p-6 sm:p-8 lg:border-l lg:border-t-0">
        <div>
          <div className="eyebrow">Estimated annual value</div>
          <output ref={out} className="tnum mt-3 block text-[48px] font-semibold leading-none tracking-tight sm:text-[60px]" aria-live="polite">
            {inr(value)}
          </output>
          <p className="mt-3 text-[14px] text-ink-2">from capacity you already own, without new stations, shifts or capex.</p>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line ring-1 ring-line">
          <Stat label="Extra units / year" value={Math.round(extraUnits).toLocaleString('en-IN')} />
          <Stat label="Per line / year" value={inr(perLine)} />
        </dl>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="text-[12px] text-ink-2">{label}</dt>
      <dd className="tnum mt-1 text-[20px] font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

function NumberField({ label, value, onChange, prefix, suffix, min, step }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; min: number; step: number;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">{label}</label>
      <div className="mt-2 flex h-11 items-center rounded-lg bg-surface px-3 shadow-[0_0_0_1px_rgba(11,11,11,0.12)] focus-within:shadow-[0_0_0_2px_var(--color-brand)]">
        {prefix && <span className="mr-1.5 text-[15px] text-muted">{prefix}</span>}
        <input
          id={id} type="number" inputMode="numeric" min={min} step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
          className="tnum w-full min-w-0 bg-transparent text-[15px] font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && <span className="ml-2 shrink-0 text-[12.5px] text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Slider({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">{label}</label>
        <span className="tnum text-[15px] font-semibold text-brand-700">{value}%</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="takt-range mt-3 w-full"
        style={{ background: `linear-gradient(to right, var(--color-brand) ${fill}%, var(--color-sunken) ${fill}%)` }}
      />
      <div className="tnum mt-2 flex justify-between text-[11.5px] text-muted">
        <span>{min}% conservative</span><span>{max}% aggressive</span>
      </div>
      <style>{`
        .takt-range { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 999px; outline: none; cursor: pointer; }
        .takt-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px rgba(11,11,11,.15), 0 1px 3px rgba(11,11,11,.15); }
        .takt-range::-moz-range-thumb { width: 18px; height: 18px; border: 0; border-radius: 999px; background: #fff; box-shadow: 0 0 0 1px rgba(11,11,11,.15), 0 1px 3px rgba(11,11,11,.15); }
        .takt-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--color-brand-100), 0 0 0 1px var(--color-brand); }
      `}</style>
    </div>
  );
}
