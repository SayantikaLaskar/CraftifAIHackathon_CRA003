// Plant configuration. Lines 1–2 are simulated demo lines; the Live cell is fed by a real camera
// (browser MediaPipe or the PipeGen DeepStream app via edge/takt_edge.py).
import type { Device, Line, Station, Zones } from './types.ts';

export const PLANT = { id: 'pune-2', name: 'Pune Plant 2', company: 'Halden Components (demo)' };

const Z: Zones = { pick: { x: 0.04, y: 0.2, w: 0.26, h: 0.6 }, place: { x: 0.7, y: 0.2, w: 0.26, h: 0.6 } };

export const LINES: Line[] = [
  { id: 'l1', name: 'Line 1 · Final Assembly', product: 'EV charger housing EVC-22', taktSec: 45, idealCycleSec: 41, plannedMinutes: 450, source: 'sim' },
  { id: 'l2', name: 'Line 2 · Controller Sub-assembly', product: 'Motor controller MC-8', taktSec: 60, idealCycleSec: 55, plannedMinutes: 450, source: 'sim' },
  { id: 'lc', name: 'Live Cell · Demo Bench', product: 'Kit assembly (live camera)', taktSec: 12, idealCycleSec: 10, plannedMinutes: 450, source: 'browser' },
];

// sim profile: mean cycle s, coefficient of variation, micro-stop probability, reject rate
export interface SimProfile { mean: number; cv: number; stopP: number; reject: number }

export const STATIONS: (Station & { sim?: SimProfile })[] = [
  { id: 'l1-s10', lineId: 'l1', order: 1, name: 'ST-10', operation: 'Base prep & gasket', cameraId: 'cam-l1-10', zones: Z, sim: { mean: 38.5, cv: 0.08, stopP: 0.01, reject: 0 } },
  { id: 'l1-s20', lineId: 'l1', order: 2, name: 'ST-20', operation: 'PCB mount, 4× screws', cameraId: 'cam-l1-20', zones: Z, sim: { mean: 42.8, cv: 0.1, stopP: 0.015, reject: 0 } },
  { id: 'l1-s30', lineId: 'l1', order: 3, name: 'ST-30', operation: 'Harness routing', cameraId: 'cam-l1-30', zones: Z, sim: { mean: 51.6, cv: 0.12, stopP: 0.02, reject: 0 } },
  { id: 'l1-s40', lineId: 'l1', order: 4, name: 'ST-40', operation: 'Cover fit & torque', cameraId: 'cam-l1-40', zones: Z, sim: { mean: 34.2, cv: 0.09, stopP: 0.01, reject: 0 } },
  { id: 'l1-s50', lineId: 'l1', order: 5, name: 'ST-50', operation: 'Functional test & label', cameraId: 'cam-l1-50', zones: Z, sim: { mean: 40.1, cv: 0.07, stopP: 0.01, reject: 0.014 } },
  { id: 'l2-s10', lineId: 'l2', order: 1, name: 'SA-10', operation: 'Heatsink & TIM', cameraId: 'cam-l2-10', zones: Z, sim: { mean: 52.0, cv: 0.09, stopP: 0.01, reject: 0 } },
  { id: 'l2-s20', lineId: 'l2', order: 2, name: 'SA-20', operation: 'Power stage solder', cameraId: 'cam-l2-20', zones: Z, sim: { mean: 57.5, cv: 0.27, stopP: 0.02, reject: 0 } },
  { id: 'l2-s30', lineId: 'l2', order: 3, name: 'SA-30', operation: 'Connector crimp', cameraId: 'cam-l2-30', zones: Z, sim: { mean: 49.0, cv: 0.1, stopP: 0.09, reject: 0 } },
  { id: 'l2-s40', lineId: 'l2', order: 4, name: 'SA-40', operation: 'Conformal coat & cure load', cameraId: 'cam-l2-40', zones: Z, sim: { mean: 54.5, cv: 0.08, stopP: 0.01, reject: 0.02 } },
  { id: 'lc-s01', lineId: 'lc', order: 1, name: 'LC-01', operation: 'Pick part → assemble → place', cameraId: 'cam-live', zones: { pick: { x: 0.68, y: 0.12, w: 0.28, h: 0.76 }, place: { x: 0.04, y: 0.12, w: 0.28, h: 0.76 } } },
];

export const SIM_DEVICES: Device[] = [
  { id: 'edge-l1', name: 'Jetson AGX Orin · Line 1', kind: 'jetson', pipeline: 'pipegen/takt-hands', model: 'person-det + hand-landmark-21', precision: 'INT8', fps: 30, latencyMs: 21, gpuUtil: 0.46, cameras: STATIONS.filter(s => s.lineId === 'l1').map(s => s.cameraId), lastSeen: Date.now(), simulated: true },
  { id: 'edge-l2', name: 'Jetson Orin NX · Line 2', kind: 'jetson', pipeline: 'pipegen/takt-hands', model: 'person-det + hand-landmark-21', precision: 'FP16', fps: 30, latencyMs: 29, gpuUtil: 0.58, cameras: STATIONS.filter(s => s.lineId === 'l2').map(s => s.cameraId), lastSeen: Date.now(), simulated: true },
];
