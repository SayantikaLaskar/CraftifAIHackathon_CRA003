import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useRealtime, type Alert } from '../lib/api.ts';
import { gsap, useGSAP } from '../lib/motion.ts';
import { SeverityBadge } from './ui.tsx';

/** Real-time alerts slide in at the top right of the console and leave on their own. */
export default function AlertToaster() {
  const [items, setItems] = useState<Alert[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  useRealtime(m => {
    if (m.kind !== 'alert' || seen.current.has(m.alert.id)) return;
    seen.current.add(m.alert.id);
    setItems(xs => [m.alert, ...xs].slice(0, 3));
    setTimeout(() => dismiss(m.alert.id), 7000);
  });
  const dismiss = (id: string) => {
    const el = box.current?.querySelector(`[data-id="${id}"]`);
    if (!el) return setItems(xs => xs.filter(x => x.id !== id));
    gsap.to(el, { x: 40, autoAlpha: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, duration: 0.35, ease: 'power2.in', onComplete: () => setItems(xs => xs.filter(x => x.id !== id)) });
  };
  useGSAP(() => {
    const el = box.current?.querySelector('[data-id]:first-child');
    if (el && !el.hasAttribute('data-shown')) {
      el.setAttribute('data-shown', '');
      gsap.fromTo(el, { x: 48, autoAlpha: 0, scale: 0.96 }, { x: 0, autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)' });
    }
  }, { dependencies: [items[0]?.id], scope: box });
  return (
    <div ref={box} className="pointer-events-none fixed right-4 top-4 z-50 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2" aria-live="polite">
      {items.map(a => (
        <div key={a.id} data-id={a.id} className="pointer-events-auto overflow-hidden rounded-xl bg-surface p-3.5 shadow-pop">
          <div className="flex items-start gap-3">
            <SeverityBadge severity={a.severity} />
            <Link to="/app/alerts" className="min-w-0 flex-1 text-[13px] leading-snug text-ink hover:underline">{a.message}</Link>
            <button onClick={() => dismiss(a.id)} className="text-muted hover:text-ink" aria-label="Dismiss"><X size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
