import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, ArrowRight, BarChart3, Check, ClipboardList, EyeOff, Gauge, Lightbulb, Lock, Server,
  Shuffle, Timer, UserX, Workflow, X,
} from 'lucide-react';
import { Button, Logo } from '../components/ui.tsx';
import { ProductPreview } from '../components/landing/ProductPreview.tsx';
import { RoiCalculator } from '../components/landing/RoiCalculator.tsx';
import { ActVisual, Architecture, CompileVisual, HandSkeleton, ZonesVisual } from '../components/landing/Visuals.tsx';
import { countUp, gsap, motionOK, revealOnScroll, useGSAP } from '../lib/motion.ts';

const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#how', label: 'How it works' },
  { href: '#roi', label: 'ROI' },
  { href: '#privacy', label: 'Privacy' },
];

export default function Landing() {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const root = scope.current!;
    const mm = motionOK(() => {
      // ---- hero intro: masked word rise, then copy, CTAs and the product window
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      tl.from('.hero-eyebrow', { autoAlpha: 0, y: 12, duration: 0.6 })
        .from('.hero-word > span', { yPercent: 110, duration: 1.05, stagger: 0.07 }, '-=0.25')
        .from('.hero-sub', { autoAlpha: 0, y: 16, duration: 0.8 }, '-=0.7')
        .from('.hero-cta > *', { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08 }, '-=0.6')
        .from('.hero-preview', { autoAlpha: 0, y: 70, rotateX: 18, scale: 0.94, transformPerspective: 1400, transformOrigin: '50% 0%', duration: 1.4 }, '-=0.55')
        .from('.hero-caption', { autoAlpha: 0, duration: 0.6 }, '-=0.6');

      // ---- continuous ambience
      gsap.to('.hero-grid', { backgroundPosition: '48px 48px', duration: 7, ease: 'none', repeat: -1 });
      gsap.to('.hero-glow', { xPercent: 18, yPercent: -10, scale: 1.12, duration: 9, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.to('.hero-glow-2', { xPercent: -16, yPercent: 12, scale: 0.9, duration: 11, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.fromTo('.pulse-ring', { scale: 0.6, opacity: 0.7 }, { scale: 2.4, opacity: 0, duration: 1.8, ease: 'power1.out', repeat: -1 });
      gsap.to('.cta-grid', { backgroundPosition: '-48px 48px', duration: 9, ease: 'none', repeat: -1 });

      // ---- scroll: the product window settles flat and drifts up slightly as you scroll past it
      gsap.to('.hero-preview-inner', {
        yPercent: -4, rotateX: -2, transformPerspective: 1400, ease: 'none',
        scrollTrigger: { trigger: '.hero-preview', start: 'top 70%', end: 'bottom top', scrub: 0.8 },
      });

      revealOnScroll(root);
      gsap.utils.toArray<HTMLElement>('.count', root).forEach(el => countUp(el));
      gsap.from('.feature-icon', {
        scale: 0.4, rotate: -25, autoAlpha: 0, duration: 0.7, ease: 'back.out(2)', stagger: 0.07,
        scrollTrigger: { trigger: '#product ul', start: 'top 80%', once: true },
      });
      gsap.from('.compare-row', {
        autoAlpha: 0, x: 24, duration: 0.7, stagger: 0.08,
        scrollTrigger: { trigger: '.compare-table', start: 'top 80%', once: true },
      });
    });
    return () => mm.revert();
  }, { scope });

  return (
    <div ref={scope} className="min-h-screen overflow-x-clip bg-page text-ink">
      <Nav />
      <main>
        <Hero />
        <Proof />
        <Problem />
        <HowItWorks />
        <Features />
        <Roi />
        <Privacy />
        <ArchitectureSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------- layout primitives

function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

function Section({ id, className, children, labelledBy }: { id?: string; className?: string; children: ReactNode; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={clsx('scroll-mt-16 py-20 sm:py-24 lg:py-28', className)}>
      <Container>{children}</Container>
    </section>
  );
}

function Heading({ id, eyebrow, title, children, center, dark }: { id: string; eyebrow: string; title: ReactNode; children?: ReactNode; center?: boolean; dark?: boolean }) {
  return (
    <div data-reveal className={clsx('max-w-[680px]', center && 'mx-auto text-center')}>
      <div className={clsx('eyebrow', dark && '!text-[#a3a29c]')}>{eyebrow}</div>
      <h2 id={id} className="mt-3 text-[30px] font-semibold leading-[1.12] tracking-tight sm:text-[40px]">{title}</h2>
      {children && <p className={clsx('mt-4 text-[16px] leading-relaxed sm:text-[17px]', dark ? 'text-[#b9b8b2]' : 'text-ink-2')}>{children}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- nav

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={clsx(
      'sticky top-0 z-50 border-b transition-[background-color,border-color] duration-200',
      scrolled ? 'border-line bg-page/80 backdrop-blur-md backdrop-saturate-150' : 'border-transparent bg-page/0',
    )}>
      <Container className="flex h-16 items-center gap-8">
        <a href="#top" aria-label="Takt home" className="shrink-0"><Logo /></a>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map(n => (
              <li key={n.href}>
                <a href={n.href} className="rounded-md px-3 py-2 text-[14px] text-ink-2 transition-colors hover:text-ink">{n.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button to="/app/live" variant="ghost" size="sm" className="hidden sm:inline-flex">Try live cell</Button>
          <Button to="/app" variant="primary" size="sm">Open console</Button>
        </div>
      </Container>
    </header>
  );
}

// ---------------------------------------------------------------- hero

function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative isolate pt-14 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-28">
      <div aria-hidden className="hero-glow pointer-events-none absolute left-[8%] top-[300px] -z-10 size-[520px] rounded-full opacity-35 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(42,120,214,0.22), transparent 62%)' }} />
      <div aria-hidden className="hero-glow-2 pointer-events-none absolute right-[6%] top-[420px] -z-10 size-[460px] rounded-full opacity-35 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(27,175,122,0.16), transparent 62%)' }} />
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px]"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(11,11,11,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,11,11,0.045) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)',
        }} />
      <Container>
        <div className="mx-auto max-w-[860px] text-center">
          <a href="#how" className="hero-eyebrow inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 text-[12.5px] text-ink-2 shadow-[0_0_0_1px_rgba(11,11,11,0.08)] transition-colors hover:text-ink">
            <span className="relative grid size-5 place-items-center rounded-full bg-brand-50"><span className="pulse-ring absolute size-2 rounded-full bg-brand/40" /><span className="relative size-1.5 rounded-full bg-brand" /></span>
            <span className="truncate">Built on CraftifAI PipeGen · TensorRT on the edge</span>
          </a>
          <h1 id="hero-title" className="mt-6 text-[36px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[56px] lg:text-[64px]">
            <HeroWords text="Every second on your line," /><br className="hidden sm:block" />{' '}<HeroWords text="measured." />
          </h1>
          <p className="hero-sub mx-auto mt-6 max-w-[620px] text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
            Takt turns the cameras already over your stations into a continuous time study. Every cycle at every station is timed at the edge, so you see the bottleneck while there is still a shift left to save.
          </p>
          <div className="hero-cta mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button to="/app" variant="primary" size="lg">Open the live console <ArrowRight size={16} /></Button>
            <a href="#how" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-surface px-5 text-[15px] font-medium text-ink shadow-[0_0_0_1px_rgba(11,11,11,0.1)] transition-colors hover:bg-sunken">
              See how it works
            </a>
          </div>
        </div>
        <div className="hero-preview mx-auto mt-14 max-w-[1080px] sm:mt-16">
          <div className="hero-preview-inner"><ProductPreview /></div>
          <p className="hero-caption mt-4 text-center text-[12.5px] text-muted">Live data from the running demo plant, Line 1 · refreshed every 5 seconds.</p>
        </div>
      </Container>
    </section>
  );
}

/** Headline words wrapped in masks so they can rise into place. */
function HeroWords({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((w, i, a) => (
        <span key={i} className="hero-word inline-block overflow-hidden pb-[0.08em] align-top">
          <span className="inline-block">{w}{i < a.length - 1 ? '\u00a0' : ''}</span>
        </span>
      ))}
    </>
  );
}

/** A frame counter that ticks at camera rate: the privacy card is "live". */
function FrameCounter() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let f = 48211, acc = 0;
    const tick = (_t: number, dt: number) => {
      acc += dt;
      if (acc >= 1000 / 30) { f += Math.floor(acc / (1000 / 30)); acc %= 1000 / 30; if (ref.current) ref.current.textContent = f.toLocaleString('en-US'); }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  return <span ref={ref} className="tnum">48,211</span>;
}

// ---------------------------------------------------------------- proof

const PROOF = [
  { value: '30 FPS', label: 'design target per camera, Jetson Orin' },
  { value: '<50 ms', label: 'glass-to-cycle latency budget' },
  { value: '0', label: 'video frames stored or sent' },
  { value: '100%', label: 'of cycles timed, every station' },
];

function Proof() {
  return (
    <section aria-label="Capabilities" className="border-y border-line bg-surface">
      <Container>
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {PROOF.map((p, i) => (
            <div key={p.label} className={clsx(
              'px-2 py-8 sm:px-6 sm:py-10',
              i % 2 === 1 && 'border-l border-line',
              i >= 2 && 'border-t border-line lg:border-t-0',
              i === 2 && 'lg:border-l',
            )}>
              <dt className="sr-only">{p.label}</dt>
              <dd className="count tnum text-[28px] font-semibold tracking-tight sm:text-[32px]">{p.value}</dd>
              <dd className="mt-1 text-[13.5px] text-ink-2 sm:text-[14px]">{p.label}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- problem

const COMPARE: { label: string; before: string; after: string }[] = [
  { label: 'Sample', before: 'A few dozen cycles', after: 'Every cycle, thousands per shift' },
  { label: 'Cadence', before: 'Once or twice a year', after: 'Continuous, 24/7' },
  { label: 'Method', before: 'Stopwatch, clipboard, an engineer on the floor', after: 'Existing cameras, timed automatically' },
  { label: 'Freshness', before: 'Stale the day it is written', after: 'Live, to the second' },
  { label: 'Bottleneck', before: 'Found after the shift misses output', after: 'Flagged as it forms, with a fix' },
];

function Problem() {
  return (
    <Section labelledBy="problem-title">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.35fr] lg:gap-16">
        <div>
          <Heading id="problem-title" eyebrow="The problem" title="The stopwatch is the bottleneck.">
            Industrial engineers time a station by hand, a few dozen cycles, once or twice a year. Then the line drifts, operators rotate and the product mix changes. The bottleneck moves, and nobody sees it until output is missed at the end of the shift.
          </Heading>
        </div>
        <div data-reveal className="compare-table overflow-hidden rounded-xl bg-surface shadow-card">
          <div className="grid grid-cols-2 border-b border-line text-[13px] font-medium sm:grid-cols-[120px_1fr_1fr]">
            <div className="hidden px-5 py-4 sm:block" />
            <div className="flex items-center gap-2 px-5 py-4 text-ink-2"><ClipboardList size={15} /> Manual time study</div>
            <div className="flex items-center gap-2 border-l border-line bg-brand-50/50 px-5 py-4 text-brand-700"><Timer size={15} /> Takt</div>
          </div>
          <dl>
            {COMPARE.map((r, i) => (
              <div key={r.label} className={clsx('compare-row grid grid-cols-2 sm:grid-cols-[120px_1fr_1fr]', i > 0 && 'border-t border-line')}>
                <dt className="col-span-2 px-5 pt-4 text-[12px] font-medium text-muted sm:col-span-1 sm:py-4">{r.label}</dt>
                <dd className="flex gap-2 px-5 pt-2 pb-4 text-[14px] text-ink-2 sm:py-4">
                  <X size={15} className="mt-0.5 shrink-0 text-axis" aria-label="Manual" />{r.before}
                </dd>
                <dd className="flex gap-2 border-l border-line bg-brand-50/50 px-5 pt-2 pb-4 text-[14px] font-medium text-ink sm:py-4">
                  <Check size={15} className="mt-0.5 shrink-0 text-brand" aria-label="Takt" />{r.after}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- how it works

const STEPS = [
  {
    n: '01', title: 'Mount and draw zones',
    body: 'Point the camera already over the station. Draw a Pick zone and a Place zone on the frame. That is the whole setup: no sensors, no tags, no MES integration.',
    visual: <ZonesVisual />,
  },
  {
    n: '02', title: 'PipeGen compiles it to the edge',
    body: 'A plain-English spec becomes a DeepStream pipeline running a TensorRT FP16 or INT8 hand-landmark model on a Jetson or GPU next to the line.',
    visual: <CompileVisual />,
  },
  {
    n: '03', title: 'Takt times every cycle and acts',
    body: 'Hand keypoints become pick, work, place and waste time for every cycle. The console recommends how to rebalance, and the Andon tower tells the floor right away.',
    visual: <ActVisual />,
  },
];

function HowItWorks() {
  return (
    <Section id="how" labelledBy="how-title" className="border-t border-line bg-surface">
      <Heading id="how-title" eyebrow="How it works" title="From existing camera to live time study in an afternoon.">
        Three steps, and no change to how operators work.
      </Heading>
      <ol className="mt-14 grid gap-6 lg:grid-cols-3">
        {STEPS.map(s => (
          <li key={s.n} data-reveal className="flex flex-col rounded-xl border border-line bg-page transition-shadow duration-300 hover:shadow-pop">
            <div className="flex items-center border-b lg:h-[248px] border-line bg-sunken/60 p-5">
              <div className="w-full">{s.visual}</div>
            </div>
            <div className="p-6">
              <div className="tnum font-mono text-[12px] text-brand-700">{s.n}</div>
              <h3 className="mt-2 text-[18px] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ---------------------------------------------------------------- features

const FEATURES = [
  { icon: Timer, title: 'Cycle time per station', body: 'Every cycle split into pick, work, place and waste, with median, p90 and variability per station.' },
  { icon: BarChart3, title: 'Yamazumi line balance', body: 'Stacked work content per station against takt, updated live, with balance efficiency in one number.' },
  { icon: Shuffle, title: 'Bottleneck and rebalance', body: 'Finds the constraint and tells you exactly how many seconds to move, where, and what it unlocks.' },
  { icon: Activity, title: 'Micro-stop detection', body: 'Catches the 10 to 60 second pauses that never reach a downtime log but quietly eat capacity.' },
  { icon: Lightbulb, title: 'Andon closed loop', body: 'Drives an ESP32 tower light per station, red, amber or green, from firmware generated by FirmGen.' },
  { icon: Gauge, title: 'Live OEE', body: 'Availability × performance × quality, computed from real cycles instead of end-of-shift tallies.' },
];

function Features() {
  return (
    <Section id="product" labelledBy="product-title" className="border-t border-line">
      <Heading id="product-title" eyebrow="Product" title="Everything an industrial engineer measures, measured all the time.">
        Takt replaces the annual time study with a live one, and turns it into decisions the line lead can act on today.
      </Heading>
      <ul className="mt-14 grid overflow-hidden rounded-xl bg-line shadow-[0_0_0_1px_var(--color-line)] gap-px sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(f => (
          <li key={f.title} className="group bg-surface p-6 transition-colors duration-300 hover:bg-surface-2 sm:p-8">
            <span className="feature-icon grid size-9 transition-transform duration-300 group-hover:-translate-y-0.5 place-items-center rounded-lg bg-brand-50 text-brand-700"><f.icon size={18} strokeWidth={2} aria-hidden /></span>
            <h3 className="mt-5 text-[16px] font-semibold tracking-tight">{f.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{f.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------- ROI

function Roi() {
  return (
    <Section id="roi" labelledBy="roi-title" className="border-t border-line bg-surface">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <Heading id="roi-title" eyebrow="ROI" title="What is a balanced line worth?">
          Rebalancing raises output from the same stations, the same people and the same shift. Put in your own numbers.
        </Heading>
      </div>
      <div data-reveal className="mt-12">
        <RoiCalculator />
      </div>
      <p className="mt-4 max-w-[760px] text-[12.5px] leading-relaxed text-muted">
        Illustrative estimate. Assumes 300 working days a year and that the unlocked capacity is sold at the stated contribution margin. Every input is editable; actual gains depend on demand and the size of the imbalance Takt finds on your lines.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------- privacy

const PRIVACY = [
  { icon: EyeOff, title: 'Keypoints only', body: 'Video is processed in memory on the edge device. Only 21 hand keypoints and cycle timings leave it.' },
  { icon: UserX, title: 'No face recognition', body: 'No faces, no identity, no badge matching. The model is trained on hands and nothing else.' },
  { icon: Workflow, title: 'The process, not the person', body: 'Takt times stations and work elements. It is built to fix line balance, not to rank operators.' },
  { icon: Server, title: 'On-prem by default', body: 'The edge app and the Takt server run inside your plant network. Nothing depends on a cloud.' },
];

function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-16 bg-ink py-20 text-white sm:py-24 lg:py-28">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
          <div>
            <Heading id="privacy-title" eyebrow="Privacy by design" dark title="It sees hands. Nothing else leaves the device.">
              Operators and unions ask the right question first. The answer is architectural, not a policy promise.
            </Heading>
            <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {PRIVACY.map(p => (
                <li key={p.title} data-reveal>
                  <p.icon size={18} className="text-[#8fb8ec]" aria-hidden />
                  <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#b9b8b2]">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal className="relative mx-auto w-full max-w-[420px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between font-mono text-[11px] text-[#898781]">
                <span>cam-l1-30 · frame <FrameCounter /></span>
                <span className="flex items-center gap-1.5"><Lock size={11} /> on-device</span>
              </div>
              <HandSkeleton className="mx-auto mt-4 w-full max-w-[260px] text-white" />
              <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-[#b9b8b2]">
{`{ "station": "ST-30",
  "t": 1792082210.993,
  "hand": "right",
  "kp": [[0.50,0.91],[0.35,0.82], … 21] }`}
              </pre>
              <p className="mt-3 text-[12px] text-[#898781]">This is the full payload sent per frame. No pixels.</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- architecture

function ArchitectureSection() {
  return (
    <Section labelledBy="arch-title">
      <Heading id="arch-title" eyebrow="Architecture" title="Inference at the station. Decisions on the floor.">
        The heavy lifting happens next to the camera. The server only ever sees keypoints and cycle events, so it runs on modest on-prem hardware.
      </Heading>
      <div data-reveal className="mt-12">
        <Architecture />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- CTA + footer

function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden border-t border-line bg-surface">
      <div aria-hidden className="cta-grid pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(11,11,11,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,11,11,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 60% 80% at 85% 50%, #000 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 80% at 85% 50%, #000 20%, transparent 75%)',
        }} />
      <Container className="py-20 sm:py-24">
        <div data-reveal className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-[620px]">
            <h2 id="cta-title" className="text-[30px] font-semibold leading-[1.12] tracking-tight sm:text-[40px]">Find the bottleneck before the shift does.</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">The console is running on live data right now. Open it, or put your own hands in front of the live cell.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button to="/app" variant="primary" size="lg">Open the live console <ArrowRight size={16} /></Button>
            <Button to="/app/live" variant="secondary" size="lg">Try live cell</Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Footer() {
  const links = [
    { to: '/app', label: 'Console' },
    { to: '/app/live', label: 'Live cell' },
    { to: '/app/edge', label: 'Edge' },
  ];
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Logo />
          <span className="text-[13px] text-muted">Built for HackwithBangalore 4.0 · PipeGen track</span>
        </div>
        <nav aria-label="Footer">
          <ul className="flex gap-1 sm:-mr-3">
            {links.map(l => (
              <li key={l.to}>
                <Button to={l.to} variant="ghost" size="sm" className="!px-3">{l.label}</Button>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
