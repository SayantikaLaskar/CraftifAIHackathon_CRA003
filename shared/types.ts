export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number }; // normalised 0..1

export type ZoneName = 'pick' | 'place';
export type Zones = Record<ZoneName, Rect>;

export type StationStatus = 'running' | 'idle' | 'over' | 'offline';
export type Source = 'sim' | 'edge' | 'browser';

export interface Station {
  id: string;
  lineId: string;
  name: string;
  operation: string;
  order: number;
  cameraId: string;
  zones: Zones;
}

export interface Line {
  id: string;
  name: string;
  product: string;
  taktSec: number;
  idealCycleSec: number;
  plannedMinutes: number; // planned production time per shift
  source: Source;
}

export interface Cycle {
  id: string;
  stationId: string;
  start: number; // epoch ms
  end: number;
  duration: number; // s
  pick: number; // s — Yamazumi segments
  work: number;
  place: number;
  waste: number; // s of micro-stop inside the cycle
  good: boolean;
  source: Source;
}

export type AlertType = 'BOTTLENECK' | 'OVER_TAKT' | 'MICROSTOP' | 'IDLE' | 'OFFLINE';
export type Severity = 'warning' | 'serious' | 'critical';

export interface Alert {
  id: string;
  ts: number;
  lineId: string;
  stationId: string | null;
  type: AlertType;
  severity: Severity;
  message: string;
  acked: boolean;
}

export interface Device {
  id: string;
  name: string;
  kind: 'jetson' | 'gpu-server' | 'browser';
  pipeline: string;
  model: string;
  precision: 'FP32' | 'FP16' | 'INT8' | 'WASM-GPU';
  fps: number;
  latencyMs: number;
  gpuUtil: number | null;
  cameras: string[];
  lastSeen: number;
  simulated?: boolean;
}

// Frame schema emitted by the PipeGen DeepStream app (and by the browser live cell).
export interface KeypointFrame {
  ts: number; // epoch ms
  cameraId: string;
  hands: Pt[][]; // each hand: 21 normalised keypoints (or a single wrist point)
}

export interface StationLive {
  stationId: string;
  status: StationStatus;
  phase: 'idle' | 'pick' | 'work' | 'place';
  cycleStartedAt: number | null;
  lastCycleAt: number | null;
}

export type ServerMessage =
  | { kind: 'cycle'; cycle: Cycle }
  | { kind: 'alert'; alert: Alert }
  | { kind: 'live'; live: StationLive }
  | { kind: 'device'; device: Device };
