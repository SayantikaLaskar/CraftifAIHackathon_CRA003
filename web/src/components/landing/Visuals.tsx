import clsx from 'clsx';
import { useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, Camera, Check, Cpu, LayoutDashboard, Lightbulb, Server } from 'lucide-react';
import { gsap, motionOK, useGSAP } from '../../lib/motion.ts';

// 21-point hand landmark layout (wrist + 4 per finger), normalised to a 200×220 box.
const HAND: [number, number][] = [
  [100, 200],
  [70, 180], [48, 155], [34, 132], [22, 112],
  [76, 120], [70, 86], [66, 62], [63, 40],
  [98, 114], [98, 76], [98, 50], [98, 26],
  [120, 118], [126, 84], [130, 60], [133, 40],
  [140, 128], [152, 102], [160, 84], [167, 66],
];
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const TIPS = [4, 8, 12, 16, 20];

/** Live-looking hand skeleton: the whole hand breathes, fingertips pulse, a scan line sweeps. */
export function HandSkeleton({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(() => {
    const mm = motionOK(() => {
      gsap.to('.hs-hand', { y: -5, rotate: 2.5, svgOrigin: '100 200', duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to('.hs-tip', { attr: { r: 5.5 }, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.18, repeat: -1, yoyo: true } });
      gsap.fromTo('.hs-scan', { attr: { y: 6 } }, { attr: { y: 210 }, duration: 2.8, ease: 'none', repeat: -1 });
      gsap.fromTo('.hs-bone', { strokeDashoffset: 60 }, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.out', stagger: 0.03, scrollTrigger: { trigger: ref.current, start: 'top 85%', once: true } });
    });
    return () => mm.revert();
  }, { scope: ref });
  return (
    <svg ref={ref} viewBox="0 0 200 220" className={className} role="img" aria-label="Hand skeleton of 21 keypoints: the only data that leaves the camera">
      <defs>
        <linearGradient id="hs-scan" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a78d6" stopOpacity="0" />
          <stop offset="1" stopColor="#2a78d6" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <rect className="hs-scan" x="0" y="6" width="200" height="14" fill="url(#hs-scan)" />
      <g className="hs-hand">
        <g stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" strokeLinecap="round">
          {BONES.map(([a, b]) => <line key={`${a}-${b}`} className="hs-bone" strokeDasharray="60" x1={HAND[a][0]} y1={HAND[a][1]} x2={HAND[b][0]} y2={HAND[b][1]} />)}
        </g>
        {HAND.map(([x, y], i) => (
          <circle key={i} className={TIPS.includes(i) ? 'hs-tip' : undefined} cx={x} cy={y} r={i === 0 ? 5 : TIPS.includes(i) ? 4 : 3.2}
            fill={TIPS.includes(i) ? '#2a78d6' : '#fff'} />
        ))}
      </g>
    </svg>
  );
}

/** Step 1: a hand works the station on loop. Pick → fixture → Place, with the cycle timed live. */
export function ZonesVisual() {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(() => {
    const mm = motionOK(() => {
      const timer = ref.current!.querySelector<SVGTextElement>('.zv-timer')!;
      const count = ref.current!.querySelector<SVGTextElement>('.zv-count')!;
      const clock = { t: 0 };
      let n = 41;
      const tl = gsap.timeline({ repeat: -1, defaults: { ease: 'power2.inOut' }, onRepeat: () => { n++; count.textContent = `#${n}`; } });
      tl.set('.zv-hand', { x: 55, y: 96 })
        .set('.zv-part', { x: 55, y: 96, autoAlpha: 1, scale: 1 })
        .set('.zv-done', { autoAlpha: 0 })
        .set(clock, { t: 0 })
        .to(clock, { t: 9.6, duration: 4.8, ease: 'none', onUpdate: () => { timer.textContent = `${clock.t.toFixed(1)}s` } }, 0)
        // pick
        .to('.zv-pick', { attr: { 'fill-opacity': 0.26 }, duration: 0.25 }, 0)
        .to('.zv-pick', { attr: { 'fill-opacity': 0.08 }, duration: 0.4 }, 0.6)
        // carry to the fixture
        .to(['.zv-hand', '.zv-part'], { x: 160, y: 90, duration: 0.8 }, 0.6)
        .to('.zv-fixture', { attr: { stroke: '#2a78d6' }, duration: 0.2 }, 1.3)
        // work: small assembly motions
        .to(['.zv-hand', '.zv-part'], { x: '+=10', y: '-=4', duration: 0.25, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 1.45)
        .to('.zv-fixture', { attr: { stroke: '#c3c2b7' }, duration: 0.3 }, 3.0)
        // place
        .to(['.zv-hand', '.zv-part'], { x: 265, y: 96, duration: 0.8 }, 3.0)
        .to('.zv-place', { attr: { 'fill-opacity': 0.26 }, duration: 0.25 }, 3.7)
        .to('.zv-part', { scale: 0.6, autoAlpha: 0, duration: 0.3, transformOrigin: '50% 50%' }, 3.85)
        .to('.zv-done', { autoAlpha: 1, duration: 0.2 }, 3.85)
        .to('.zv-place', { attr: { 'fill-opacity': 0.08 }, duration: 0.4 }, 4.1)
        // hand returns
        .to('.zv-hand', { x: 55, y: 96, duration: 0.9 }, 4.0)
        .to({}, { duration: 0.2 });
    });
    return () => mm.revert();
  }, { scope: ref });

  return (
    <svg ref={ref} viewBox="0 0 320 180" className="h-auto w-full" role="img" aria-label="Overhead camera view of a workstation: a hand picks a part from the Pick zone, assembles it at the fixture, and places it in the Place zone while the cycle is timed">
      <rect width="320" height="180" rx="8" fill="#f3f3f0" />
      <g stroke="#e1e0d9" strokeWidth="1">
        {[40, 80, 120, 160, 200, 240, 280].map(x => <line key={x} x1={x} y1="0" x2={x} y2="180" />)}
        {[45, 90, 135].map(y => <line key={y} x1="0" y1={y} x2="320" y2={y} />)}
      </g>
      <rect className="zv-fixture" x="112" y="58" width="96" height="64" rx="6" fill="#fff" stroke="#c3c2b7" strokeWidth="1.5" />
      <text x="160" y="114" textAnchor="middle" fontSize="9" fill="#898781" fontFamily="JetBrains Mono, monospace">fixture</text>
      <rect className="zv-pick" x="16" y="32" width="78" height="116" rx="6" fill="#1baf7a" fillOpacity=".08" stroke="#1baf7a" strokeWidth="1.5" strokeDasharray="5 4" />
      <rect className="zv-place" x="226" y="32" width="78" height="116" rx="6" fill="#6250d6" fillOpacity=".08" stroke="#6250d6" strokeWidth="1.5" strokeDasharray="5 4" />
      <rect x="22" y="38" width="34" height="16" rx="3" fill="#1baf7a" />
      <text x="39" y="49.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#fff" fontFamily="Inter, sans-serif">Pick</text>
      <rect x="232" y="38" width="40" height="16" rx="3" fill="#6250d6" />
      <text x="252" y="49.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#fff" fontFamily="Inter, sans-serif">Place</text>
      {/* parts bin + finished parts */}
      {[0, 1, 2].map(i => <rect key={i} x={36 + i * 12} y="122" width="9" height="9" rx="2" fill="#1baf7a" fillOpacity=".55" />)}
      <rect className="zv-done" x="259" y="122" width="11" height="11" rx="2.5" fill="#6250d6" fillOpacity=".75" />
      {[0, 1].map(i => <rect key={i} x={245 + i * 28} y="122" width="11" height="11" rx="2.5" fill="#6250d6" fillOpacity=".75" />)}
      {/* the carried part + the tracked hand (keypoint centroid) */}
      <rect className="zv-part" x="-6" y="-6" width="12" height="12" rx="2.5" fill="#1baf7a" transform="translate(55 96)" />
      <g className="zv-hand" transform="translate(55 96)">
        <circle r="15" fill="#2a78d6" fillOpacity=".12" />
        <circle r="9" fill="none" stroke="#2a78d6" strokeWidth="2" />
        <circle r="2.5" fill="#2a78d6" />
        {[[-9, -12], [-3, -15], [3, -15], [9, -12], [-13, -2]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.8" fill="#2a78d6" />)}
      </g>
      {/* HUD */}
      <rect x="10" y="156" width="104" height="17" rx="4" fill="#0b0b0b" />
      <text x="18" y="167.5" fontSize="9.5" fill="#d6d5cf" fontFamily="JetBrains Mono, monospace">cycle <tspan className="zv-count" fill="#8fb8ec">#41</tspan></text>
      <text className="zv-timer" x="106" y="167.5" textAnchor="end" fontSize="9.5" fontWeight="600" fill="#fff" fontFamily="JetBrains Mono, monospace">0.0s</text>
      <circle cx="304" cy="14" r="3" fill="#d03b3b" className="live-dot" />
      <text x="296" y="17" textAnchor="end" fontSize="9" fill="#52514e" fontFamily="JetBrains Mono, monospace">cam-l1-30</text>
    </svg>
  );
}

const PIPE_LINES = [
  <><span className="text-[#8fb8ec]">v4l2src</span> → nvstreammux</>,
  <>→ <span className="text-[#8fb8ec]">nvinfer</span> hand_detector.engine</>,
  <>→ nvtracker → <span className="text-[#8fb8ec]">nvinfer</span> hand_landmark.engine</>,
];

/** Step 2: the spec is typed, PipeGen compiles, pipeline stages appear, engine goes ready. Loops. */
export function CompileVisual() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = motionOK(() => {
      const spec = ref.current!.querySelector<HTMLSpanElement>('.cv-spec')!;
      const full = spec.dataset.text ?? '';
      const typed = { n: 0 };
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.8 });
      tl.set('.cv-line', { autoAlpha: 0.14, x: -6 })
        .set('.cv-ready', { autoAlpha: 0, scale: 0.8 })
        .set('.cv-bar', { scaleX: 0 })
        .set(typed, { n: 0 })
        .to(typed, { n: full.length, duration: 2.2, ease: 'none', onUpdate: () => { spec.textContent = full.slice(0, Math.round(typed.n)); } })
        .to('.cv-bar', { scaleX: 1, duration: 1.2, ease: 'power2.inOut' }, '+=0.15')
        .to('.cv-line', { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.35 }, '-=0.5')
        .to('.cv-ready', { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(2.5)' }, '+=0.1')
        .to({}, { duration: 2.4 })
        .to('.cv-line', { autoAlpha: 0.14, duration: 0.4 })
        .to('.cv-ready', { autoAlpha: 0, duration: 0.4 }, '<');
      gsap.to('.cv-caret', { autoAlpha: 0, duration: 0.5, repeat: -1, yoyo: true, ease: 'steps(1)' });
    });
    return () => mm.revert();
  }, { scope: ref });
  const SPEC = 'Track both hands at 30 FPS on cam-l1-30. Emit 21 keypoints per hand. No frames to disk.';
  return (
    <div ref={ref} className="grid gap-2 font-mono text-[11px] leading-[1.6]" aria-label="A plain-English spec compiled by PipeGen into a DeepStream pipeline with a TensorRT engine">
      <div className="min-h-[60px] rounded-lg bg-surface px-3 py-2.5 text-ink-2 shadow-[0_0_0_1px_rgba(11,11,11,0.08)]">
        <span className="text-muted">spec › </span><span className="cv-spec" data-text={SPEC}>{SPEC}</span><span className="cv-caret ml-px inline-block h-3 w-[5px] translate-y-0.5 bg-brand" />
      </div>
      <div className="flex items-center justify-center gap-2 py-0.5 text-[10.5px] text-muted">
        <span className="relative h-px flex-1 overflow-hidden bg-line"><span className="cv-bar absolute inset-0 origin-left bg-brand" /></span>
        PipeGen<ArrowDown size={11} />
        <span className="relative h-px flex-1 overflow-hidden bg-line"><span className="cv-bar absolute inset-0 origin-left bg-brand" /></span>
      </div>
      <div className="relative rounded-lg bg-ink px-3 py-2.5 text-[#d6d5cf]">
        {PIPE_LINES.map((l, i) => <div key={i} className="cv-line">{l}</div>)}
        <div className="cv-line mt-0.5 flex flex-wrap gap-x-3 text-[#898781]"><span>TensorRT · FP16 / INT8</span><span>Jetson Orin</span></div>
        <span className="cv-ready absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded bg-[#0ca30c]/20 px-1.5 py-0.5 text-[10px] font-medium text-[#7ee07e]"><Check size={10} strokeWidth={3} />engine ready</span>
      </div>
    </div>
  );
}

/** Step 3: a cycle fills segment by segment, overruns takt, the recommendation lands, ST-30 goes red. */
export function ActVisual() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = motionOK(() => {
      const t = ref.current!.querySelector<HTMLSpanElement>('.av-time')!;
      const label = ref.current!.querySelector<HTMLSpanElement>('.av-label-30')!;
      const clock = { s: 0 };
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
      tl.set('.av-seg', { scaleX: 0 })
        .set('.av-rec', { autoAlpha: 0.3, y: 4 })
        .call(() => { label.textContent = 'On takt'; })
        .set('.av-light-30', { backgroundColor: '#0ca30c' })
        .set(clock, { s: 0 })
        .to(clock, { s: 53.2, duration: 3.2, ease: 'none', onUpdate: () => { t.textContent = `${clock.s.toFixed(1)}s`; } }, 0)
        .to('.av-seg', { scaleX: 1, duration: 0.8, stagger: 0.8, ease: 'none' }, 0)
        .to('.av-light-30', { backgroundColor: '#fab219', duration: 0.2 }, 2.0)
        .to('.av-light-30', { backgroundColor: '#d03b3b', duration: 0.2 }, 2.7)
        .call(() => { label.textContent = 'Over takt'; }, [], 2.7)
        .to('.av-rec', { autoAlpha: 1, y: 0, duration: 0.5 }, 3.3)
        .to({}, { duration: 2.2 });
      gsap.to('.av-glow', { scale: 2.2, opacity: 0, duration: 1.2, repeat: -1, ease: 'power1.out' });
    });
    return () => mm.revert();
  }, { scope: ref });
  const lights = [
    { name: 'ST-20', cls: 'bg-good', label: 'On takt' },
    { name: 'ST-30', cls: 'av-light-30 bg-critical', label: 'Over takt', glow: true },
    { name: 'ST-40', cls: 'bg-warning', label: 'Waiting' },
  ];
  return (
    <div ref={ref} className="grid gap-2">
      <div className="rounded-lg bg-surface px-3 py-2.5 shadow-[0_0_0_1px_rgba(11,11,11,0.08)]">
        <div className="flex items-center justify-between text-[11px] text-muted"><span>Cycle #4,812 · ST-30</span><span className="av-time tnum font-medium text-ink">53.2s</span></div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <span className="av-seg origin-left bg-s-pick" style={{ width: '14%' }} />
          <span className="av-seg origin-left bg-s-work" style={{ width: '66%' }} />
          <span className="av-seg origin-left bg-s-place" style={{ width: '12%' }} />
          <span className="av-seg origin-left bg-s-waste" style={{ width: '8%' }} />
        </div>
      </div>
      <div className="av-rec rounded-lg bg-surface px-3 py-2.5 text-[11.5px] shadow-[0_0_0_1px_rgba(11,11,11,0.08)]">
        <div className="font-medium text-ink">Move 9.4s from ST-30 to ST-40</div>
        <div className="mt-0.5 text-brand-700">+21% line capacity</div>
      </div>
      <ul className="grid grid-cols-3 gap-2" aria-label="Andon tower states per station">
        {lights.map(l => (
          <li key={l.name} className="flex flex-col items-center gap-1 rounded-lg bg-surface py-2 shadow-[0_0_0_1px_rgba(11,11,11,0.08)]">
            <span className="relative grid place-items-center" aria-hidden>
              {l.glow && <span className="av-glow av-light-30 absolute size-2.5 rounded-full bg-critical" />}
              <span className={clsx('relative size-2.5 rounded-full', l.cls)} />
            </span>
            <span className="font-mono text-[10px] text-ink">{l.name}</span>
            <span className={clsx('text-[10px] text-muted', l.glow && 'av-label-30')}>{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Node({ icon, title, sub, meta, accent }: { icon: ReactNode; title: string; sub: string; meta: string; accent?: boolean }) {
  return (
    <div className={clsx('arch-node relative flex-1 rounded-xl bg-surface p-4 shadow-card', accent && 'ring-1 ring-brand/40')}>
      <div className="flex items-center gap-2.5">
        <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', accent ? 'bg-brand-50 text-brand-700' : 'bg-sunken text-ink-2')}>{icon}</span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold tracking-tight">{title}</div>
          <div className="text-[12px] text-muted">{sub}</div>
        </div>
      </div>
      <div className="mt-3 border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-ink-2">{meta}</div>
    </div>
  );
}

/** Connector with data packets flowing along it (horizontal on desktop, vertical on mobile). */
function Edge({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 py-2 lg:w-[76px] lg:flex-col lg:gap-1.5 lg:py-0">
      <span className="arch-track relative h-6 w-px bg-axis/70 lg:h-px lg:w-11" aria-hidden>
        {[0, 1, 2].map(i => <span key={i} className="arch-packet absolute left-1/2 top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand opacity-0 lg:left-0 lg:top-1/2 lg:translate-x-0" />)}
        <ArrowDown size={12} className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-axis lg:hidden" />
        <ArrowRight size={12} className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-axis lg:block" />
      </span>
      <span className="text-center font-mono text-[10.5px] leading-tight text-muted lg:mt-1.5">{label}</span>
    </div>
  );
}

export function Architecture() {
  const ref = useRef<HTMLElement>(null);
  useGSAP(() => {
    const mm = motionOK(() => {
      const packets = gsap.utils.toArray<HTMLElement>('.arch-packet');
      const inner = gsap.matchMedia();
      inner.add({ lg: '(min-width: 1024px)', sm: '(max-width: 1023px)' }, ctx => {
        const prop = ctx.conditions!.lg ? 'left' : 'top';
        packets.forEach((p, i) => {
          gsap.fromTo(p, { [prop]: '0%', opacity: 0 }, {
            keyframes: [{ opacity: 1, duration: 0.15 }, { [prop]: '100%', duration: 1.1, ease: 'none' }, { opacity: 0, duration: 0.15 }],
            repeat: -1, delay: (i % 3) * 0.45 + Math.floor(i / 3) * 0.2,
          });
        });
      });
      gsap.from('.arch-node', {
        autoAlpha: 0, y: 18, duration: 0.7, stagger: 0.1,
        scrollTrigger: { trigger: ref.current, start: 'top 80%', once: true },
      });
      return () => inner.revert();
    });
    return () => mm.revert();
  }, { scope: ref });

  return (
    <figure ref={ref} aria-label="Architecture: station camera to the PipeGen DeepStream app on the edge device, keypoints to the Takt server, then to the console and the Andon tower">
      <div className="flex flex-col items-stretch lg:flex-row lg:items-center">
        <div className="rounded-2xl border border-dashed border-axis bg-surface-2/60 p-3 lg:flex-[2.25]">
          <div className="flex items-center justify-between px-1 pb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            <span>At the station</span><span className="font-mono normal-case tracking-normal">Jetson / GPU</span>
          </div>
          <div className="flex flex-col items-stretch lg:flex-row lg:items-center">
            <Node icon={<Camera size={16} />} title="Station camera" sub="Existing, overhead" meta="CSI / RTSP · 30 FPS" />
            <Edge label="frames" />
            <Node accent icon={<Cpu size={16} />} title="DeepStream app" sub="Generated by PipeGen" meta="TensorRT · FP16 / INT8" />
          </div>
        </div>
        <Edge label="keypoints" />
        <Node icon={<Server size={16} />} title="Takt server" sub="On-prem" meta="Cycle engine · SQLite" />
        <Edge label="events" />
        <div className="flex flex-1 flex-col gap-3">
          <Node icon={<LayoutDashboard size={16} />} title="Console" sub="Browser" meta="OEE · Yamazumi" />
          <Node icon={<Lightbulb size={16} />} title="Andon tower" sub="ESP32 · FirmGen" meta="Red / amber / green" />
        </div>
      </div>
      <figcaption className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-ink-2">
        <span><span className="font-medium text-ink">Video</span> never leaves the dashed boundary.</span>
        <span><span className="font-medium text-ink">Keypoints</span> and cycle events travel as JSON over the plant network.</span>
      </figcaption>
    </figure>
  );
}
