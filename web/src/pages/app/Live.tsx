import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { Camera, CircleDot, Download, EyeOff, Eye, Plug, RotateCcw, Square, SquareDashedMousePointer } from 'lucide-react';
import { CycleTracker, readZones } from '@shared/engine.ts';
import type { Cycle, KeypointFrame, Pt, Rect, StationLive, ZoneName, Zones } from '@shared/types.ts';
import { Badge, Button, Card, CardHeader, PageHeader, Skeleton } from '../../components/ui.tsx';
import { api, useResource, type LineView } from '../../lib/api.ts';
import { gsap, ping, pop, useGSAP } from '../../lib/motion.ts';
import { HandSkeleton } from '../../components/landing/Visuals.tsx';
import { sec, timeS } from '../../lib/format.ts';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const ZONE_COLOR: Record<ZoneName, string> = { pick: '#1baf7a', place: '#6250d6' };
type Andon = 'G' | 'Y' | 'R';

// Minimal Web Serial typing (Chrome / Edge)
type SerialPortLike = { open(o: { baudRate: number }): Promise<void>; writable: WritableStream<Uint8Array> };
type SerialNav = Navigator & { serial?: { requestPort(): Promise<SerialPortLike> } };

export default function LiveCell() {
  const { data } = useResource<LineView>('/api/lines/lc');
  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-96" /><Skeleton className="h-[520px]" /></div>;
  return <LiveCellInner view={data} />;
}

function LiveCellInner({ view }: { view: LineView }) {
  const station = view.stations[0];
  const takt = view.line.taktSec;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const landmarker = useRef<HandLandmarker | null>(null);
  const tracker = useRef(new CycleTracker(station.id, station.zones, 'browser'));
  const handsRef = useRef<Pt[][]>([]);
  const perf = useRef({ frames: 0, t: performance.now(), fps: 0, infer: 0 });
  const recording = useRef<KeypointFrame[] | null>(null);
  const writer = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const andonRef = useRef<Andon | null>(null);
  const andonSentAt = useRef(0);

  const [state, setState] = useState<'off' | 'loading' | 'on' | 'error'>('off');
  const [err, setErr] = useState('');
  const [zones, setZones] = useState<Zones>(station.zones);
  const [editing, setEditing] = useState<ZoneName | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [privacy, setPrivacy] = useState(true);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [live, setLive] = useState<StationLive | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isRec, setIsRec] = useState(false);
  const [serial, setSerial] = useState<'none' | 'connected' | 'error'>('none');
  const [aspect, setAspect] = useState('16 / 9');

  const zonesRef = useRef(zones); zonesRef.current = zones;
  const dragRef = useRef(drag); dragRef.current = drag;
  const privacyRef = useRef(privacy); privacyRef.current = privacy;
  const editingRef = useRef(editing); editingRef.current = editing;

  // ------------------------------------------------------------ camera + model
  const start = async () => {
    setState('loading'); setErr('');
    try {
      const [stream, fs] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }),
        FilesetResolver.forVisionTasks(MP),
      ]);
      landmarker.current ??= await HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      const v = videoRef.current!;
      v.srcObject = stream; await v.play();
      const c = canvasRef.current!; c.width = v.videoWidth; c.height = v.videoHeight;
      setAspect(`${v.videoWidth} / ${v.videoHeight}`);
      setState('on');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setState('error'); }
  };

  const stop = () => {
    (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop());
    setState('off');
  };
  useEffect(() => () => { (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()); }, []);

  // ------------------------------------------------------------ frame loop
  useEffect(() => {
    if (state !== 'on') return;
    let raf = 0, lastT = -1;
    const loop = () => {
      const v = videoRef.current!, c = canvasRef.current!, ctx = c.getContext('2d')!;
      if (v.currentTime !== lastT && landmarker.current) {
        lastT = v.currentTime;
        const t0 = performance.now();
        const res = landmarker.current.detectForVideo(v, t0);
        const p = perf.current; p.infer = p.infer * 0.9 + (performance.now() - t0) * 0.1; p.frames++;
        if (t0 - p.t > 1000) { p.fps = Math.round((p.frames * 1000) / (t0 - p.t)); p.frames = 0; p.t = t0; }
        const hands: Pt[][] = (res.landmarks ?? []).map(h => h.map(q => ({ x: q.x, y: q.y })));
        handsRef.current = hands;
        const ts = Date.now();
        const cyc = tracker.current.update(hands, ts);
        if (cyc) onCycle(cyc);
        if (recording.current) recording.current.push({ ts, cameraId: station.cameraId, hands: hands.map(h => h.map(q => ({ x: +q.x.toFixed(4), y: +q.y.toFixed(4) }))) });
        draw(ctx, c.width, c.height, v, hands);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, v: HTMLVideoElement, hands: Pt[][]) => {
    ctx.save();
    if (privacyRef.current) { ctx.fillStyle = '#0d0f12'; ctx.fillRect(0, 0, W, H); drawGrid(ctx, W, H); }
    else { ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, W, H); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    const reading = readZones(hands, zonesRef.current);
    for (const name of ['pick', 'place'] as ZoneName[]) {
      const z = zonesRef.current[name];
      const x = (1 - z.x - z.w) * W, y = z.y * H, w = z.w * W, h = z.h * H;
      const active = reading === name;
      ctx.fillStyle = ZONE_COLOR[name] + (active ? '40' : '1c');
      ctx.strokeStyle = ZONE_COLOR[name]; ctx.lineWidth = active ? 4 : 2; ctx.setLineDash(active ? [] : [10, 8]);
      roundRect(ctx, x, y, w, h, 14); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '600 22px Inter, sans-serif';
      const label = name === 'pick' ? 'PICK' : 'PLACE';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = ZONE_COLOR[name]; roundRect(ctx, x + 12, y + 12, tw + 24, 34, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(label, x + 24, y + 37);
    }
    const d = dragRef.current;
    if (d && editingRef.current) {
      ctx.strokeStyle = ZONE_COLOR[editingRef.current]; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
      ctx.strokeRect((1 - d.x - d.w) * W, d.y * H, d.w * W, d.h * H); ctx.setLineDash([]);
    }
    for (const hand of hands) {
      const P = (i: number) => [(1 - hand[i].x) * W, hand[i].y * H] as const;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
        const [a, b] = [P(start), P(end)]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      for (let i = 0; i < hand.length; i++) { const [x, y] = P(i); ctx.fillStyle = i % 4 === 0 ? '#2a78d6' : '#fff'; ctx.beginPath(); ctx.arc(x, y, i === 0 ? 6 : 4, 0, Math.PI * 2); ctx.fill(); }
      const ids = [0, 5, 9, 13, 17]; const cx = ids.reduce((s, i) => s + P(i)[0], 0) / 5, cy = ids.reduce((s, i) => s + P(i)[1], 0) / 5;
      ctx.strokeStyle = '#2a78d6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
    }
  };

  // ------------------------------------------------------------ cycles, andon, server sync
  const burstRef = useRef<HTMLDivElement>(null);
  const onCycle = useCallback((c: Cycle) => {
    setCycles(cs => [c, ...cs].slice(0, 50)); setFresh(c.id);
    writer.current?.write(new TextEncoder().encode(`CYCLE,${station.name},${c.duration.toFixed(1)}\n`)).catch(() => {});
    api('/api/ingest/cycles', { method: 'POST', body: JSON.stringify({ cycles: [c] }) }).catch(() => {});
  }, [station.name]);

  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now(); setNow(n);
      if (state !== 'on') return;
      const l = tracker.current.live(n, takt); setLive(l);
      const el = l.cycleStartedAt ? (n - l.cycleStartedAt) / 1000 : 0;
      const a: Andon = l.status === 'idle' ? 'Y' : el > takt ? 'R' : el > takt * 0.8 ? 'Y' : 'G';
      if (a !== andonRef.current || n - andonSentAt.current > 5000) { // resend keeps the board's link watchdog fed
        andonRef.current = a; andonSentAt.current = n; sendSerial(`ANDON,${station.name},${a}\n`);
      }
    }, 200);
    return () => clearInterval(t);
  }, [state, takt, station.name]);

  useEffect(() => {
    if (state !== 'on') return;
    const t = setInterval(() => {
      const l = tracker.current.live(Date.now(), takt);
      api('/api/ingest/live', { method: 'POST', body: JSON.stringify({ live: l }) }).catch(() => {});
      api('/api/devices/heartbeat', { method: 'POST', body: JSON.stringify({
        id: 'browser-live', name: 'Browser edge · Live cell', kind: 'browser', pipeline: 'takt-live (MediaPipe)', model: 'hand-landmark-21',
        precision: 'WASM-GPU', fps: perf.current.fps, latencyMs: Math.round(perf.current.infer), gpuUtil: null, cameras: [station.cameraId], lastSeen: Date.now(),
      }) }).catch(() => {});
    }, 1000);
    return () => clearInterval(t);
  }, [state, takt, station.cameraId]);

  const sendSerial = (line: string) => { writer.current?.write(new TextEncoder().encode(line)).catch(() => setSerial('error')); };
  const connectAndon = async () => {
    const nav = navigator as SerialNav;
    if (!nav.serial) { setSerial('error'); alert('Web Serial requires Chrome or Edge on desktop.'); return; }
    try {
      const port = await nav.serial.requestPort(); await port.open({ baudRate: 115200 });
      writer.current = port.writable.getWriter(); setSerial('connected');
      andonRef.current = null; // force resend
    } catch { setSerial('error'); }
  };

  // ------------------------------------------------------------ zone editing
  const toNorm = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: 1 - (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const anchor = useRef<Pt | null>(null);
  const onDown = (e: React.PointerEvent) => { if (!editing) return; anchor.current = toNorm(e); (e.target as Element).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!editing || !anchor.current) return;
    const p = toNorm(e), a = anchor.current;
    setDrag({ x: Math.max(0, Math.min(a.x, p.x)), y: Math.max(0, Math.min(a.y, p.y)), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
  };
  const onUp = () => {
    if (editing && drag && drag.w > 0.04 && drag.h > 0.04) {
      const z = { ...zones, [editing]: drag };
      setZones(z); tracker.current.zones = z;
      api(`/api/stations/${station.id}/zones`, { method: 'PUT', body: JSON.stringify({ zones: z }) }).catch(() => {});
    }
    anchor.current = null; setDrag(null); setEditing(null);
  };

  const toggleRec = () => {
    if (recording.current) {
      const lines = recording.current.map(f => JSON.stringify(f)).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines], { type: 'application/x-ndjson' }));
      a.download = `takt-keypoints-${Date.now()}.jsonl`; a.click();
      recording.current = null; setIsRec(false);
    } else { recording.current = []; setIsRec(true); }
  };

  const reset = async () => {
    await api(`/api/lines/lc/reset`, { method: 'POST' }).catch(() => {});
    tracker.current = new CycleTracker(station.id, zones, 'browser'); setCycles([]);
  };

  // ------------------------------------------------------------ motion
  const phaseBox = useRef<HTMLDivElement>(null);
  const andonBox = useRef<HTMLDivElement>(null);
  useGSAP(() => { // celebrate each completed cycle over the camera view
    const c = cycles[0]; const b = burstRef.current; if (!c || !b) return;
    const v = b.querySelector('.burst-val'); if (v) v.textContent = `#${cycles.length} · ${c.duration.toFixed(1)}s`;
    (v as HTMLElement | null)?.classList.toggle('text-critical-ink', c.duration > takt);
    gsap.timeline()
      .fromTo(b, { autoAlpha: 0, y: -14, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(2)' })
      .to(b, { autoAlpha: 0, y: -8, duration: 0.35, ease: 'power2.in' }, '+=1.3');
    ping(stageRef.current, c.duration > takt ? 'rgba(208,59,59,0.55)' : 'rgba(12,163,12,0.5)');
  }, { dependencies: [cycles[0]?.id] });
  useGSAP(() => { pop(phaseBox.current?.querySelector(`[data-phase="${live?.phase}"]`) ?? null); }, { dependencies: [live?.phase] });

  // ------------------------------------------------------------ derived
  const el = live?.cycleStartedAt ? (now - live.cycleStartedAt) / 1000 : 0;
  const andonNow: Andon = state !== 'on' ? 'G' : live?.status === 'idle' ? 'Y' : el > takt ? 'R' : el > takt * 0.8 ? 'Y' : 'G';
  const andon = andonNow;
  useGSAP(() => { pop(andonBox.current); }, { dependencies: [andon] });
  const durs = cycles.map(c => c.duration);
  const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;

  return (
    <>
      <PageHeader eyebrow="Live cell · LC-01" title="Live cycle timing"
        subtitle="Your webcam becomes a station camera. Hand keypoints are timed through Pick → Work → Place in your browser, and no video leaves the device."
        actions={<>
          {state === 'on' ? <Button onClick={stop}><Square size={14} />Stop camera</Button> : null}
          <Button onClick={reset} variant="ghost"><RotateCcw size={14} />Reset</Button>
        </>} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Card className="overflow-hidden">
            <div ref={stageRef} className={clsx('relative w-full bg-[#0d0f12]', editing && 'cursor-crosshair')} style={{ aspectRatio: aspect }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
              <video ref={videoRef} playsInline muted className="hidden" />
              <canvas ref={canvasRef} className={clsx('absolute inset-0 size-full', state !== 'on' && 'invisible')} />
              {state !== 'on' && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div className="max-w-md">
                    <div className="relative mx-auto w-[150px]">
                      <HandSkeleton className="w-full text-white" />
                      <div className="absolute -right-1 bottom-2 grid size-9 place-items-center rounded-full bg-white/10 text-white backdrop-blur"><Camera size={16} /></div>
                    </div>
                    <h3 className="mt-4 text-[17px] font-semibold text-white">Set up a one-minute station</h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-white/60">
                      Put a few parts on your <b className="text-white/90">left</b> (Pick) and an empty tray on your <b className="text-white/90">right</b> (Place).
                      Pick a part, do something with it in the middle, and drop it in the tray. Takt times each cycle.
                    </p>
                    <Button variant="primary" size="lg" className="mt-5" onClick={start} disabled={state === 'loading'}>
                      {state === 'loading' ? 'Loading hand model…' : 'Start camera'}
                    </Button>
                    {state === 'error' && <p className="mt-3 text-[13px] text-[#ff8a8a]">{err}</p>}
                  </div>
                </div>
              )}
              {state === 'on' && (
                <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
                  <span className="rounded-md bg-black/55 px-2 py-1 text-[11.5px] font-medium text-white backdrop-blur tnum">{perf.current.fps} FPS · {perf.current.infer.toFixed(0)} ms</span>
                  <span className="rounded-md bg-black/55 px-2 py-1 text-[11.5px] font-medium text-white backdrop-blur">{privacy ? 'Privacy: keypoints only' : 'Video visible (local only)'}</span>
                  {isRec && <span className="rounded-md bg-critical px-2 py-1 text-[11.5px] font-medium text-white">● Recording keypoints</span>}
                </div>
              )}
              <div ref={burstRef} className="pointer-events-none invisible absolute left-1/2 top-6 -translate-x-1/2 rounded-xl bg-white/95 px-4 py-2.5 text-center shadow-pop">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Cycle complete</div>
                <div className="burst-val text-[26px] font-semibold leading-tight tracking-tight tnum text-ink">—</div>
              </div>
              {editing && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center">
                  <span className="rounded-md bg-black/70 px-3 py-1.5 text-[12.5px] text-white">Drag on the image to draw the {editing.toUpperCase()} zone</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
              <Button size="sm" variant={editing === 'pick' ? 'primary' : 'secondary'} onClick={() => setEditing(editing === 'pick' ? null : 'pick')} disabled={state !== 'on'}>
                <SquareDashedMousePointer size={14} />Draw Pick zone</Button>
              <Button size="sm" variant={editing === 'place' ? 'primary' : 'secondary'} onClick={() => setEditing(editing === 'place' ? null : 'place')} disabled={state !== 'on'}>
                <SquareDashedMousePointer size={14} />Draw Place zone</Button>
              <div className="mx-1 h-5 w-px bg-line" />
              <Button size="sm" variant="ghost" onClick={() => setPrivacy(p => !p)}>{privacy ? <><Eye size={14} />Show video</> : <><EyeOff size={14} />Privacy mode</>}</Button>
              <Button size="sm" variant="ghost" onClick={toggleRec} disabled={state !== 'on'}>{isRec ? <><Download size={14} />Stop &amp; download</> : <><CircleDot size={14} />Record keypoints</>}</Button>
              <span className="ml-auto text-[12px] text-muted">Engine: shared/engine.ts · same code runs on the PipeGen edge path</span>
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader title="Cycle history" subtitle={`Last ${Math.min(30, cycles.length)} cycles against a ${takt}s takt`} />
            <div className="px-5 pb-5 pt-4"><CycleBars cycles={cycles.slice(0, 30).reverse()} takt={takt} /></div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">Current cycle</span>
              {state === 'on' ? <Badge tone={andon === 'G' ? 'good' : andon === 'Y' ? 'warning' : 'critical'}>{andon === 'G' ? 'On takt' : andon === 'Y' ? (live?.status === 'idle' ? 'Waiting' : 'Approaching takt') : 'Over takt'}</Badge> : <Badge>Camera off</Badge>}
            </div>
            <div className={clsx('mt-2 text-[56px] font-semibold leading-none tracking-tight tnum', el > takt && 'text-critical-ink')}>{el.toFixed(1)}<span className="text-[22px] text-muted">s</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className={clsx('h-full rounded-full transition-[width] duration-200', el > takt ? 'bg-critical' : el > takt * 0.8 ? 'bg-warning' : 'bg-brand')} style={{ width: `${Math.min(100, (el / takt) * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11.5px] text-muted tnum"><span>0s</span><span>takt {takt}s</span></div>
            <div ref={phaseBox} className="mt-5 grid grid-cols-3 gap-1.5">
              {(['pick', 'work', 'place'] as const).map(ph => (
                <div key={ph} data-phase={ph} className={clsx('rounded-lg border px-2 py-2 text-center text-[12px] font-medium capitalize transition-colors',
                  live?.phase === ph ? 'border-transparent text-white' : 'border-line text-muted')}
                  style={live?.phase === ph ? { background: ph === 'pick' ? ZONE_COLOR.pick : ph === 'place' ? ZONE_COLOR.place : '#2a78d6' } : undefined}>{ph}</div>
              ))}
            </div>
          </Card>

          <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line">
            {[['Cycles', String(cycles.length)], ['Average', cycles.length ? sec(avg) : '—'], ['Best', cycles.length ? sec(Math.min(...durs)) : '—'], ['Last', cycles[0] ? sec(cycles[0].duration) : '—']].map(([k, v]) => (
              <div key={k} className="bg-surface px-5 py-4"><div className="text-[12px] text-muted">{k}</div><div className="mt-0.5 text-[20px] font-semibold tracking-tight tnum">{v}</div></div>
            ))}
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold">Andon tower</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">ESP32 tower light (FirmGen firmware) over Web Serial. It mirrors the station state in real time.</p>
              </div>
              <div ref={andonBox}><AndonTower state={andon} /></div>
            </div>
            <Button size="sm" className="mt-3 w-full" variant={serial === 'connected' ? 'secondary' : 'dark'} onClick={connectAndon} disabled={serial === 'connected'}>
              <Plug size={14} />{serial === 'connected' ? 'Andon connected · 115200' : 'Connect Andon (USB)'}
            </Button>
            {serial === 'error' && <p className="mt-2 text-[12px] text-critical-ink">Could not open the serial port.</p>}
          </Card>

          <Card className="min-h-0 flex-1 overflow-hidden">
            <CardHeader title="Cycles" subtitle="Synced to the Takt server" />
            <div className="mt-3 max-h-[300px] overflow-y-auto">
              {cycles.length === 0 && <p className="px-5 pb-5 text-[13px] text-muted">No cycles yet.</p>}
              {cycles.map((c, i) => (
                <div key={c.id} className={clsx('flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13px] tnum', fresh === c.id && 'flash-in')}>
                  <span className="w-6 text-muted">#{cycles.length - i}</span>
                  <span className={clsx('w-14 font-semibold', c.duration > takt && 'text-critical-ink')}>{sec(c.duration)}</span>
                  <span className="flex-1 text-[12px] text-muted">W {c.work.toFixed(1)} · P {c.pick.toFixed(1)} · Pl {c.place.toFixed(1)}</span>
                  <span className="text-[12px] text-muted">{timeS(c.end)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function AndonTower({ state }: { state: Andon }) {
  const lamp = (on: boolean, color: string, label: string) => (
    <div className="size-5 rounded-full border border-black/10 transition-all" aria-label={`${label} ${on ? 'on' : 'off'}`}
      style={{ background: on ? color : '#e9e8e3', boxShadow: on ? `0 0 14px ${color}` : 'none' }} />
  );
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg bg-[#1b1c1f] p-1.5">
      {lamp(state === 'R', '#d03b3b', 'red')}{lamp(state === 'Y', '#fab219', 'amber')}{lamp(state === 'G', '#0ca30c', 'green')}
    </div>
  );
}

function CycleBars({ cycles, takt }: { cycles: Cycle[]; takt: number }) {
  const h = 140;
  const box = useRef<HTMLDivElement>(null);
  useGSAP(() => { // the newest bar grows in from the baseline
    const last = box.current?.querySelector('[data-bar]:last-child');
    if (last) gsap.from(last, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.6, ease: 'power3.out' });
  }, { dependencies: [cycles[cycles.length - 1]?.id] });
  if (!cycles.length) return <div className="grid h-[140px] place-items-center rounded-lg border border-dashed border-line text-[13px] text-muted">Cycles will appear here as you work.</div>;
  const max = Math.max(takt * 1.3, ...cycles.map(c => c.duration));
  return (
    <div className="relative" style={{ height: h }}>
      <div className="absolute inset-x-0 border-t-[1.5px] border-dashed border-critical" style={{ bottom: `${(takt / max) * 100}%` }}>
        <span className="absolute -top-5 right-0 rounded bg-critical-bg px-1.5 text-[11px] font-medium text-critical-ink">Takt {takt}s</span>
      </div>
      <div ref={box} className="flex h-full items-end gap-[3px]">
        {cycles.map(c => {
          let acc = 0;
          return (
            <div key={c.id} data-bar className="group relative flex h-full flex-1 flex-col-reverse" title={`${c.duration.toFixed(1)}s`}>
              {(['work', 'pick', 'place', 'waste'] as const).map(k => {
                const v = c[k]; acc += v;
                return v > 0 ? <div key={k} style={{ height: `${(v / max) * 100}%`, background: `var(--color-s-${k})` }} className="mt-[2px] w-full first:rounded-b-none last:rounded-t-[3px]" /> : null;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
