#!/usr/bin/env python3
"""takt_edge: bridge from a CraftifAI PipeGen DeepStream app to the Takt server.

The PipeGen-generated app (run.sh) prints one JSON object per frame on stdout (or publishes it to MQTT).
This bridge normalises those frames into Takt's KeypointFrame schema, batches them, and POSTs them to
/api/ingest/frames, where the shared cycle engine (shared/engine.ts) turns them into timed cycles.
It also sends a device heartbeat with live FPS and latency.

  ./run.sh | python3 edge/takt_edge.py --server http://takt-host:8787 --camera cam-l1-30
  python3 edge/takt_edge.py --replay recording.jsonl --camera cam-live            # recorded in the Live cell
  python3 edge/takt_edge.py --mqtt localhost --topic takt/keypoints --camera ...   # needs paho-mqtt

Accepted input frame shapes (auto-detected):
  Takt   {"ts": 1712345678901, "cameraId": "...", "hands": [[{"x":..,"y":..}, ...21], ...]}
  PipeGen/DeepStream  {"ts_ms"|"timestamp", "width", "height",
                       "objects": [{"class"|"label": "hand", "keypoints": [[x,y,(conf)], ...]}, ...]}
Coordinates may be normalised (0..1) or pixels (divided by width/height).
"""
import argparse, json, sys, threading, time, urllib.request

def norm_frame(raw, camera):
    if 'hands' in raw:
        ts = raw['ts'] if raw.get('ts') is not None else time.time() * 1000
        return {'ts': int(ts), 'cameraId': raw.get('cameraId') or camera, 'hands': raw['hands']}
    w, h = raw.get('width') or 1, raw.get('height') or 1
    ts = next((raw[k] for k in ('ts_ms', 'timestamp') if raw.get(k) is not None), time.time() * 1000)
    if isinstance(ts, str):  # ISO timestamp from nvmsgconv
        from datetime import datetime
        ts = datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp() * 1000
    hands = []
    for o in raw.get('objects', []):
        if str(o.get('class', o.get('label', ''))).lower() not in ('hand', 'hands', 'hand_landmark'):
            continue
        pts = []
        for p in o.get('keypoints', []):
            x, y = (p['x'], p['y']) if isinstance(p, dict) else (p[0], p[1])
            if x > 1.5 or y > 1.5:
                x, y = x / w, y / h
            pts.append({'x': round(x, 4), 'y': round(y, 4)})
        if pts:
            hands.append(pts)
    return {'ts': int(ts), 'cameraId': raw.get('cameraId') or camera, 'hands': hands}

class Bridge:
    def __init__(self, server, camera, device, batch_ms=200):
        self.server, self.camera, self.device, self.batch_ms = server.rstrip('/'), camera, device, batch_ms
        self.buf, self.lock = [], threading.Lock()
        self.frames, self.cycles, self.t0, self.lat = 0, 0, time.time(), 0.0
        threading.Thread(target=self._flusher, daemon=True).start()
        threading.Thread(target=self._heartbeat, daemon=True).start()

    def _post(self, path, body):
        req = urllib.request.Request(self.server + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read() or b'{}')

    def push(self, frame):
        with self.lock:
            self.buf.append(frame); self.frames += 1
        self.lat = self.lat * 0.9 + max(0, time.time() * 1000 - frame['ts']) * 0.1

    def flush(self):
        with self.lock:
            batch, self.buf = self.buf, []
        if not batch:
            return
        try:
            r = self._post('/api/ingest/frames', {'frames': batch})
            if r.get('cycles'):
                self.cycles += r['cycles']
                print(f"[takt-edge] +{r['cycles']} cycle(s) · total {self.cycles}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f'[takt-edge] post failed: {e}', file=sys.stderr, flush=True)

    def _flusher(self):
        while True:
            time.sleep(self.batch_ms / 1000); self.flush()

    def _heartbeat(self):
        while True:
            time.sleep(3)
            el = max(1e-3, time.time() - self.t0); fps = round(self.frames / el)
            self.frames, self.t0 = 0, time.time()
            try:
                self._post('/api/devices/heartbeat', {
                    'id': self.device, 'name': f'PipeGen edge · {self.camera}', 'kind': 'gpu-server',
                    'pipeline': 'pipegen/takt-hands', 'model': 'hand-landmark-21 (TensorRT)', 'precision': args.precision,
                    'fps': fps, 'latencyMs': round(self.lat), 'gpuUtil': None, 'cameras': [self.camera], 'lastSeen': 0})
            except Exception:
                pass

def lines_from(src):
    for line in src:
        line = line.strip()
        if line.startswith('{'):
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue  # DeepStream also prints perf logs; skip non-JSON lines

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--server', default='http://localhost:8787')
    ap.add_argument('--camera', default='cam-live', help='station cameraId configured in Takt')
    ap.add_argument('--device', default='pipegen-edge-1')
    ap.add_argument('--precision', default='FP16', choices=['FP32', 'FP16', 'INT8'])
    ap.add_argument('--replay', help='replay a recorded JSONL file in real time')
    ap.add_argument('--speed', type=float, default=1.0, help='replay speed multiplier')
    ap.add_argument('--mqtt', help='MQTT broker host (instead of stdin)')
    ap.add_argument('--topic', default='takt/keypoints')
    args = ap.parse_args()
    b = Bridge(args.server, args.camera, args.device)

    if args.replay:
        rows = list(lines_from(open(args.replay)))
        if not rows:
            sys.exit('empty recording')
        first = norm_frame(rows[0], args.camera)['ts']; start = time.time() * 1000
        for raw in rows:
            f = norm_frame(raw, args.camera)
            due = start + (f['ts'] - first) / args.speed
            time.sleep(max(0, (due - time.time() * 1000) / 1000))
            f['ts'] = int(time.time() * 1000); f['cameraId'] = args.camera
            b.push(f)
        time.sleep(0.5); b.flush()
        print(f'[takt-edge] replay done · {b.cycles} cycles', file=sys.stderr)
    elif args.mqtt:
        import paho.mqtt.client as mqtt  # optional dependency
        c = mqtt.Client()
        c.on_message = lambda _c, _u, m: b.push(norm_frame(json.loads(m.payload), args.camera))
        c.connect(args.mqtt); c.subscribe(args.topic); c.loop_forever()
    else:
        for raw in lines_from(sys.stdin):
            b.push(norm_frame(raw, args.camera))
        b.flush()
