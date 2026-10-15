// Landing-page motion system (GSAP). Every animation goes through `motionOK` so users who ask for
// reduced motion get the static page.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);
gsap.defaults({ ease: 'power3.out', duration: 0.8 });

export { gsap, ScrollTrigger, useGSAP };

export const MOTION_OK = '(prefers-reduced-motion: no-preference)';

/** Run `fn` only when motion is allowed; GSAP reverts everything if the preference changes. */
export function motionOK(fn: () => void | (() => void)) {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, fn);
  return mm;
}

/** Scroll reveal for every `[data-reveal]` inside `scope`: fade + rise, staggered per batch. */
export function revealOnScroll(scope: Element) {
  const els = gsap.utils.toArray<HTMLElement>('[data-reveal]', scope);
  if (!els.length) return;
  gsap.set(els, { autoAlpha: 0, y: 28 });
  ScrollTrigger.batch(els, {
    start: 'top 88%',
    once: true,
    onEnter: batch => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08, overwrite: true }),
  });
}

/** Count a number up from 0 when it scrolls into view, preserving its prefix/suffix. */
export function countUp(el: HTMLElement, opts: { decimals?: number; start?: string } = {}) {
  const text = el.textContent ?? '';
  const m = text.match(/^(\D*)([\d,.]+)(.*)$/);
  if (!m) return;
  const [, pre, num, post] = m;
  const target = parseFloat(num.replace(/,/g, ''));
  const decimals = opts.decimals ?? (num.split('.')[1]?.length ?? 0);
  const obj = { v: 0 };
  el.textContent = `${pre}${(0).toFixed(decimals)}${post}`;
  gsap.to(obj, {
    v: target, duration: 1.6, ease: 'power2.out',
    scrollTrigger: { trigger: el, start: opts.start ?? 'top 90%', once: true },
    onUpdate: () => { el.textContent = `${pre}${obj.v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${post}`; },
  });
}

// ---------------------------------------------------------------- console motion

const REDUCED = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let queue: Element[] = [];
let scheduled = false;

/** Entrance for elements mounting together (cards on a page): batched into one staggered rise. */
export function enter(el: Element | null) {
  if (!el || REDUCED()) return;
  gsap.set(el, { autoAlpha: 0, y: 14 });
  queue.push(el);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    const batch = queue.filter(e => e.isConnected); queue = []; scheduled = false;
    gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.045, clearProps: 'transform,opacity,visibility' });
  });
}

/** Tween the number inside a React text node (keeps React's node, so later renders still apply). */
export function tweenNumber(el: HTMLElement | null, from: number, to: number, fmt: (v: number) => string, duration = 0.9) {
  const node = el?.firstChild as Text | null;
  if (!node || node.nodeType !== 3 || REDUCED()) return;
  const o = { v: from };
  node.nodeValue = fmt(from);
  gsap.to(o, { v: to, duration, ease: 'power2.out', overwrite: true, onUpdate: () => { node.nodeValue = fmt(o.v); } });
}

/** Brief highlight ring on an element (a station completing a cycle, a new row…). */
export function ping(el: Element | null, color = 'rgba(42,120,214,0.55)') {
  if (!el || REDUCED()) return;
  gsap.fromTo(el, { boxShadow: `0 0 0 3px ${color}` }, { boxShadow: '0 0 0 0px rgba(42,120,214,0)', duration: 1.1, ease: 'power2.out', clearProps: 'boxShadow' });
}

export function pop(el: Element | null) {
  if (!el || REDUCED()) return;
  gsap.fromTo(el, { scale: 0.86 }, { scale: 1, duration: 0.45, ease: 'back.out(3)', clearProps: 'transform' });
}
