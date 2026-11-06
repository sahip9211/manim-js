# Experiment 010: surface memory and lifecycle

The same 262,144-triangle torus and 1280×720 image are compared with the frozen renderer from commit `6558213`. All five captured phases must match the native ManimGL reference. Quality is unchanged.

## Memory accounting

Summed RSS counts shared pages in each process. PSS apportions shared pages among their users; it is a better estimate of a process group’s share of physical memory. Neither figure is the JavaScript heap. See [Linux proc documentation](https://docs.kernel.org/filesystems/proc.html). Changing accounting does not free memory.

The table separates blank-browser overhead from the incremental scene. No garbage collection is forced. Three snapshots form a checkpoint; values below average fresh-process runs with reversed order. The suffix shows blank-browser settling time. The 15-second follow-up investigates startup noise independently of the initial 1.5-second runs. Browser subtotals exclude the Node runner and sampling subprocesses. Missing access produces null, not zero.

| Browser / variant | Runs | Blank PSS MiB | Active PSS MiB | Scene increment PSS MiB | Active summed RSS MiB | PSS after 12 disposal cycles MiB |
|---|---:|---:|---:|---:|---:|---:|
| chromium / frozen-010 (1.5s) | 2 | 418.69 | 439.19 | 20.50 | 1013.36 | 446.11 |
| chromium / instanced (1.5s) | 2 | 417.65 | 426.25 | 8.60 | 994.17 | 434.25 |
| chromium / canvas (1.5s) | 2 | 417.12 | 426.03 | 8.92 | 990.88 | 432.92 |
| firefox / frozen-010 (1.5s) | 2 | 468.07 | 520.71 | 52.64 | 1278.35 | 623.44 |
| firefox / instanced (1.5s) | 2 | 439.19 | 496.42 | 57.23 | 1261.96 | 506.19 |
| firefox / canvas (1.5s) | 2 | 466.39 | — | — | — | 616.77 |
| firefox / frozen-010 (15s) | 2 | 496.96 | 599.79 | 102.83 | 1395.57 | 639.34 |
| firefox / instanced (15s) | 2 | 483.26 | 516.64 | 33.37 | 1313.44 | 511.35 |

## Throughput and allocations

| Browser / variant | Completion ms | GPU ms | CPU % | GPU render engine % | Index bytes | Explicit texture MiB |
|---|---:|---:|---:|---:|---:|---:|
| chromium / frozen-010 (1.5s) | 1.831 | 0.913 | 17.01 | 45.72 | 3145728 | 7.043 |
| chromium / instanced (1.5s) | 1.805 | 0.864 | 17.99 | 46.96 | 768 | 7.043 |
| chromium / canvas (1.5s) | 1.744 | 0.868 | 19.99 | 49.33 | 768 | 0.012 |
| firefox / frozen-010 (1.5s) | 1.254 | — | 133.98 | 41.91 | 3145728 | 7.043 |
| firefox / instanced (1.5s) | 1.250 | — | 71.94 | 46.08 | 768 | 7.043 |
| firefox / canvas (1.5s) | 1.655 | — | 67.92 | 47.43 | 768 | 0.012 |
| firefox / frozen-010 (15s) | 1.356 | — | 24.97 | 54.29 | 3145728 | 7.043 |
| firefox / instanced (15s) | 1.621 | — | 26.02 | 60.53 | 768 | 7.043 |

Completion uses eight-frame batches with synchronous one-pixel readback. GPU time is separately queried where available. CPU 100% is one logical core; GPU utilization is Intel client render-engine busy time. Utilization is measured under continuous work, so faster throughput can raise utilization. Default browser framebuffer allocations are excluded from explicit textures but included where visible to process/DRM accounting. This is not displayed FPS.

## Interpretation and selected default

The instanced offscreen renderer is the new default. In the initial Chromium pair, scene-added PSS falls from 20.50 to 8.60 MiB (58%); whole-browser active PSS falls from 439.19 to 426.25 MiB (2.9%). Completion changes from 1.831 to 1.805 ms, which is a small difference on this desktop. The deterministic index allocation falls 4096-fold, from 3 MiB to 768 bytes; this ratio does not describe total RAM or throughput.

Initial Firefox runs show substantial parent-process startup variation, including a missing snapshot when child processes exit. Their aggregate RAM changes do not establish a reliable percentage saving. The follow-up uses a longer blank-browser settling interval; all initial attempts remain in the tables. Direct canvas rendering is retained as an explicit experimental option, because the initial run offered little extra Chromium memory benefit and slower Firefox completion. It is not selected automatically.

The longer Firefox follow-up averages 599.79 → 516.64 MiB active PSS and 102.83 → 33.37 MiB scene-added PSS. Completion increases from 1.356 to 1.621 ms (19.5% slower). Parent-process variation remains substantial, so these two repeats are a measured memory/throughput tradeoff, not a universal improvement or a precise Firefox savings estimate. The memory-focused default is instanced; `{ mode: 'tiled' }` remains available for comparison. No additional 10× throughput gain is established.

## Changes tested

- `frozen-010`: immutable earlier renderer, full 32-bit index mesh, preserved canvas buffer, and an extra depth-enabled default framebuffer.
- `instanced`: one 768-byte 8×8 patch reused for all cells, no preserved canvas buffer, and no redundant default depth buffer. Existing full-resolution offscreen color/depth attachments remain.
- `canvas`: the same instanced mesh renders into the browser framebuffer directly, eliminating the library-owned intermediate color/depth attachments. The browser still allocates its own framebuffer.

GPU resources are unbound before deletion, following [WebGL resource-lifecycle guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). `dispose({ releaseContext: true })` additionally releases the context when the canvas will be discarded. Ordinary `dispose()` retains context reuse. Frozen disposal predates this option; repeated mount/unmount measurements compare the former terminal-disposal behavior with explicit new release. Browser and driver caches can retain memory after disposal; short runs do not prove the absence of all leaks.

Screenshots are encoded as PNG in the browser and collected after active-scene measurements, avoiding a large RGBA/base64/JSON transfer before RAM sampling. This fixes benchmark overhead; it must not be credited as renderer memory savings. The older experiment’s whole-tree RAM is therefore not directly comparable to these isolated checkpoints.

The initial runs queried `defaultFramebufferDepthBits` while the offscreen framebuffer was bound, so that field described the offscreen target. Their recorded `contextAttributes.depth` is the reliable default-context setting. Follow-up runs query default depth before creating attachments; no rendering behavior changes with this metadata correction.

## Retained attempts and captures

- [2026-11-06T14-11-14-015Z-516216-memory-chromium-frozen-010](runs/2026-11-06T14-11-14-015Z-516216-memory-chromium-frozen-010/result.json): complete, screening, parity passed; [frames](runs/2026-11-06T14-11-14-015Z-516216-memory-chromium-frozen-010/frozen-010-comparison.png).
- [2026-11-06T14-11-34-312Z-516216-memory-chromium-instanced](runs/2026-11-06T14-11-34-312Z-516216-memory-chromium-instanced/result.json): complete, screening, parity passed; [frames](runs/2026-11-06T14-11-34-312Z-516216-memory-chromium-instanced/instanced-comparison.png).
- [2026-11-06T14-14-10-747Z-520781-memory-chromium-canvas](runs/2026-11-06T14-14-10-747Z-520781-memory-chromium-canvas/result.json): complete, screening, parity passed; [frames](runs/2026-11-06T14-14-10-747Z-520781-memory-chromium-canvas/canvas-comparison.png).
- [2026-11-06T14-15-35-637Z-522996-memory-chromium-frozen-010](runs/2026-11-06T14-15-35-637Z-522996-memory-chromium-frozen-010/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-15-35-637Z-522996-memory-chromium-frozen-010/frozen-010-comparison.png).
- [2026-11-06T14-15-57-801Z-522996-memory-chromium-instanced](runs/2026-11-06T14-15-57-801Z-522996-memory-chromium-instanced/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-15-57-801Z-522996-memory-chromium-instanced/instanced-comparison.png).
- [2026-11-06T14-16-20-115Z-522996-memory-chromium-canvas](runs/2026-11-06T14-16-20-115Z-522996-memory-chromium-canvas/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-16-20-115Z-522996-memory-chromium-canvas/canvas-comparison.png).
- [2026-11-06T14-16-43-878Z-522996-memory-firefox-frozen-010](runs/2026-11-06T14-16-43-878Z-522996-memory-firefox-frozen-010/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-16-43-878Z-522996-memory-firefox-frozen-010/frozen-010-comparison.png).
- [2026-11-06T14-17-33-830Z-522996-memory-firefox-instanced](runs/2026-11-06T14-17-33-830Z-522996-memory-firefox-instanced/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-17-33-830Z-522996-memory-firefox-instanced/instanced-comparison.png).
- [2026-11-06T14-18-23-423Z-522996-memory-firefox-canvas](runs/2026-11-06T14-18-23-423Z-522996-memory-firefox-canvas/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-18-23-423Z-522996-memory-firefox-canvas/canvas-comparison.png).
- [2026-11-06T14-19-15-462Z-522996-memory-chromium-canvas](runs/2026-11-06T14-19-15-462Z-522996-memory-chromium-canvas/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-19-15-462Z-522996-memory-chromium-canvas/canvas-comparison.png).
- [2026-11-06T14-19-38-759Z-522996-memory-chromium-instanced](runs/2026-11-06T14-19-38-759Z-522996-memory-chromium-instanced/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-19-38-759Z-522996-memory-chromium-instanced/instanced-comparison.png).
- [2026-11-06T14-20-01-952Z-522996-memory-chromium-frozen-010](runs/2026-11-06T14-20-01-952Z-522996-memory-chromium-frozen-010/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-20-01-952Z-522996-memory-chromium-frozen-010/frozen-010-comparison.png).
- [2026-11-06T14-20-26-281Z-522996-memory-firefox-canvas](runs/2026-11-06T14-20-26-281Z-522996-memory-firefox-canvas/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-20-26-281Z-522996-memory-firefox-canvas/canvas-comparison.png).
- [2026-11-06T14-21-18-495Z-522996-memory-firefox-instanced](runs/2026-11-06T14-21-18-495Z-522996-memory-firefox-instanced/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-21-18-495Z-522996-memory-firefox-instanced/instanced-comparison.png).
- [2026-11-06T14-22-11-481Z-522996-memory-firefox-frozen-010](runs/2026-11-06T14-22-11-481Z-522996-memory-firefox-frozen-010/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-22-11-481Z-522996-memory-firefox-frozen-010/frozen-010-comparison.png).
- [2026-11-06T14-26-13-440Z-544688-memory-firefox-frozen-010](runs/2026-11-06T14-26-13-440Z-544688-memory-firefox-frozen-010/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-26-13-440Z-544688-memory-firefox-frozen-010/frozen-010-comparison.png).
- [2026-11-06T14-27-20-759Z-544688-memory-firefox-instanced](runs/2026-11-06T14-27-20-759Z-544688-memory-firefox-instanced/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-27-20-759Z-544688-memory-firefox-instanced/instanced-comparison.png).
- [2026-11-06T14-28-21-238Z-544688-memory-firefox-instanced](runs/2026-11-06T14-28-21-238Z-544688-memory-firefox-instanced/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-28-21-238Z-544688-memory-firefox-instanced/instanced-comparison.png).
- [2026-11-06T14-29-19-104Z-544688-memory-firefox-frozen-010](runs/2026-11-06T14-29-19-104Z-544688-memory-firefox-frozen-010/result.json): complete, full, parity passed; [frames](runs/2026-11-06T14-29-19-104Z-544688-memory-firefox-frozen-010/frozen-010-comparison.png).

Run `npm run bench:memory`, then `npm run report:memory`. `--quick` screens one fresh session per mode with fewer timing rounds. `--variants=frozen-010,instanced` and `--browser=firefox` narrow the run. Add `--settle-ms=15000` to reproduce the startup-noise follow-up. Frozen sources and raw telemetry accompany every attempt.
