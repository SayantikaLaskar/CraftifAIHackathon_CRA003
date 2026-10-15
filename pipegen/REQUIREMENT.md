# PipeGen Stage 1: Requirement for Takt

Paste the block below into PipeGen's Requirement stage. Takt's server and cycle engine consume the
output schema, so it must match exactly.

---

> **Goal:** a real-time hand-keypoint pipeline for manual assembly stations. It measures work cycles
> only and stores no video.
>
> **Input:** 1–8 fixed overhead or angled station cameras (USB or RTSP), 1280×720 or 1920×1080 at 30 fps.
> Each camera maps to one station ID, for example `cam-l1-30`.
>
> **Perception:**
> 1. Detect people and hands in each frame with a lightweight detector, and track them with NvDCF so
>    each hand keeps a stable ID.
> 2. For each hand ROI, run a **21-point hand-landmark model** (MediaPipe topology: wrist = 0, MCPs = 5/9/13/17)
>    as a secondary inference.
> 3. Compile both models to **TensorRT**. Build **FP16** as the default and also an **INT8** engine
>    (calibrated on about 500 station frames). Report throughput, latency and accuracy for FP32, FP16 and INT8.
>
> **Output (actionable, required):** one JSON line per frame per camera, on stdout **and** MQTT topic
> `takt/keypoints`:
> ```json
> {"ts_ms": 1734000000000, "cameraId": "cam-l1-30", "width": 1280, "height": 720,
>  "objects": [{"class": "hand", "track_id": 4, "keypoints": [[x, y, conf], ... 21]}]}
> ```
> Coordinates are in pixels (Takt normalises them). Hands below 0.4 confidence are dropped.
>
> **Privacy:** no frames are written to disk or streamed. The OSD and RTSP output are for debugging only
> and are off by default.
>
> **Performance target:** at least 30 fps per camera and under 50 ms from frame capture to JSON, on
> Jetson Orin NX / AGX Orin or any RTX GPU.

---

## Stage checklist (evidence for submission)
| Stage | Output to capture |
|---|---|
| 1. Requirement | the block above |
| 2. Pipeline IR | screenshot of the node graph (it should match `pipeline_ir.json`) |
| 3. Model | selected detector and hand-landmark ONNX from the catalog or GitHub |
| 4. Compiler | TensorRT speed report → save as `pipegen/trt_report.json` (shown on Takt's Edge page) |
| 5. Run | `./run.sh` streaming JSON into `edge/takt_edge.py` |

`trt_report.json` format (read by `GET /api/pipegen`):
```json
{ "source": "PipeGen v0.5.1 compiler", "engines": [
  { "model": "hand-landmark-21", "precision": "FP16", "throughputFps": 0, "latencyMs": 0, "accuracy": "PCK@0.2 …", "gpu": "Jetson Orin NX" } ] }
```

## Wire it to Takt
```bash
./run.sh | python3 ../edge/takt_edge.py --server http://<takt-host>:8787 --camera cam-l1-30 --precision FP16
# or from MQTT
python3 edge/takt_edge.py --mqtt localhost --topic takt/keypoints --camera cam-l1-30
```
