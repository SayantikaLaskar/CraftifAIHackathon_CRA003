# Takt: build plan

## Product
**Takt is an AI time-and-motion engineer for assembly lines.** You point the existing station cameras
at the work, and Takt measures every cycle at every station. It shows where the line loses time and
which station is the bottleneck, and tells you how to rebalance the work. It needs no sensors, no
stopwatch studies and no MES integration.

Who buys it: plant managers and industrial engineers (IE) at discrete manufacturers such as auto
components, electronics assembly and appliances.

## How a camera measures a cycle
Each station has two zones set by the IE in the console: **Pick**, where parts are taken from, and
**Place**, where the finished unit goes. PipeGen runs a 21-point hand-keypoint model on the station
camera at the edge. The Takt engine debounces zone entries into a state machine:

`IDLE → PICK → WORK → PLACE (cycle complete)`. Cycle time is the time from one PLACE to the next, which
is the standard IE definition. Each cycle is split into Pick, Work and Place segments, and those
segments make up the Yamazumi (stacked work-content) chart. If no hands are in either zone for more
than 8 s, that time is recorded as a *micro-stop*.

## Architecture
```
Station camera ─▶ PipeGen DeepStream app (TensorRT hand-landmark, FP16/INT8)  ── JSON keypoints ─┐
Browser "Live cell" (MediaPipe, same schema) ────────────────────────────────── cycles ─────────┤
                                                                                                 ▼
                            edge/takt_edge.py (bridge) ─▶  Takt server (Node, SQLite, WebSocket)
                                                             • shared/engine.ts  (cycle state machine)
                                                             • shared/analytics.ts (OEE, balance, rebalance)
                                                             • simulator for the demo plant lines
                                                                      │ REST + WS
                                          Takt console (React) ◀──────┘──▶ Andon tower (ESP32, FirmGen)
```

## Deliverables
1. **Landing page (`/`)**: hero, problem, how it works, features, interactive ROI calculator,
   privacy section, architecture, CTA.
2. **Console (`/app`)**: Overview, Line detail (station flow, Yamazumi, cycle trends, distribution,
   rebalance recommendations, cycle log), Live cell (webcam, zone editor, live cycles), Alerts, Edge
   devices (PipeGen pipeline and TensorRT stats), Settings.
3. **Server**: REST and WS API, SQLite persistence, ingestion of raw PipeGen keypoints and of
   finished cycles, and a simulator that backfills the shift.
4. **Edge**: `edge/takt_edge.py` bridges the PipeGen DeepStream app to the Takt server, and can replay
   recorded keypoint files.
5. **PipeGen**: Stage-1 requirement and target Pipeline IR.
6. **FirmGen**: frozen PRD for the ESP32 Andon tower. This is the closed-loop bonus.
7. **Tests** for the engine and analytics.

## Design system
Neutral, light enterprise UI using the validated palette: page `#f9f9f7`, surfaces `#ffffff` and
`#fcfcfb`, ink `#0b0b0b`, `#52514e` and `#898781`, hairlines `#e1e0d9`, accent blue `#2a78d6`. Status
colours are reserved (good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b`) and
always come with an icon and a label. The typeface is Inter, with tabular figures in tables and axes
only. Spacing follows an 8 px grid, and cards use a 12 px radius.
