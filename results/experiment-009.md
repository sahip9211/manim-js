# ManimGL animation comparison

The workload is a travelling-wave torus, 512×256 cells (262,144 triangles), rendered at 1280×720 with equal perspective, vertex lighting, colors, finite-difference normals, depth testing, and no MSAA. The native baseline uses vectorized NumPy geometry updates and the pinned upstream renderer. Browser variants compute geometry on the GPU and use shared indexed vertices.

All speedups are specific to this animation, not whole-library parity. Offscreen batch completion is not displayed-frame latency. Both browsers remain on workspace 5.

Native median completion times varied from 23.40 to 47.33 ms across full repeats on this active desktop. Paired ratios below use the reference immediately preceding each browser pair. A conservative comparison against the fastest native repeat is also stored in the JSON; for the latest tiled runs it is chromium: 13.08×, firefox: 15.60×. The 10× threshold is exceeded for this workload even against that faster reference. This does not imply a 10× GPU-only gain or completion of the separate fluid-FFT target.

## Completed full runs

| Runtime / mode | Completion median / p95 ms | GPU median ms | Completion speedup vs ManimGL | GPU speedup vs ManimGL | GPU buffers MiB |
|---|---:|---:|---:|---:|---:|
| [manimgl / manimgl](runs/2026-11-06T13-35-09-042Z-458938-parity-manimgl/result.json) | 23.40 / 34.87 | 5.00 | —× | —× | 14.03 |
| [manimgl / manimgl](runs/2026-11-06T13-39-11-269Z-466065-parity-manimgl/result.json) | 37.72 / 43.99 | 5.31 | —× | —× | 14.03 |
| [chromium / direct](runs/2026-11-06T13-39-39-223Z-466065-parity-chromium/result.json) | 2.07 / 3.64 | 1.05 | 18.25× | 5.06× | 3.00 |
| [chromium / basis](runs/2026-11-06T13-39-39-223Z-466065-parity-chromium/result.json) | 2.40 / 4.43 | 1.24 | 15.70× | 4.29× | 3.00 |
| [firefox / direct](runs/2026-11-06T13-40-17-857Z-466065-parity-firefox/result.json) | 1.62 / 3.41 | — | 23.25× | —× | 3.00 |
| [firefox / basis](runs/2026-11-06T13-40-17-857Z-466065-parity-firefox/result.json) | 1.48 / 3.60 | — | 25.53× | —× | 3.00 |
| [manimgl / manimgl](runs/2026-11-06T13-43-34-404Z-474649-parity-manimgl/result.json) | 47.33 / 69.40 | 6.50 | —× | —× | 14.03 |
| [chromium / basis](runs/2026-11-06T13-44-15-965Z-474649-parity-chromium/result.json) | 2.06 / 3.19 | 1.13 | 22.95× | 5.74× | 3.00 |
| [chromium / tiled](runs/2026-11-06T13-44-15-965Z-474649-parity-chromium/result.json) | 1.79 / 2.92 | 0.80 | 26.45× | 8.09× | 3.00 |
| [firefox / basis](runs/2026-11-06T13-44-56-726Z-474649-parity-firefox/result.json) | 1.65 / 4.96 | — | 28.60× | —× | 3.00 |
| [firefox / tiled](runs/2026-11-06T13-44-56-726Z-474649-parity-firefox/result.json) | 1.50 / 2.17 | — | 31.55× | —× | 3.00 |
| [manimgl / manimgl](runs/2026-11-06T13-47-56-568Z-482068-parity-manimgl/result.json) | 44.07 / 52.42 | 5.57 | —× | —× | 14.03 |

Completion timing includes update, submission and completion of eight-frame batches, divided by eight. JavaScript uses synchronous one-pixel framebuffer readback; ManimGL uses a native queue fence. GPU timestamps measure render passes separately. Native WGPU timestamp ticks are multiplied by the recorded device period. Warmup, full-resolution screenshots, query readback, and PNG encoding are outside timed batches.

## Sustained resource samples

Each mode runs continuously for about three seconds. The table uses samples entirely inside that interval. CPU 100% means one logical core. RAM sums the runner and descendants and may double-count shared pages; it includes browser infrastructure. Intel client-resident memory includes driver allocations and is not exclusive geometry memory. Render-engine busy time is not frequency-normalized whole-GPU utilization. Missing measurements stay unavailable.

| Runtime / mode | Samples | CPU median % | Peak tree RAM MiB | Intel render engine median % | Peak Intel resident MiB |
|---|---:|---:|---:|---:|---:|
| manimgl / manimgl | 0 | — | — | — | — |
| manimgl / manimgl | 5 | 101.99 | 423.59 | 12.05 | 268.64 |
| chromium / direct | 5 | 28.04 | 1295.15 | 44.48 | 86.03 |
| chromium / basis | 6 | 31.97 | 1292.43 | 41.93 | 90.02 |
| firefox / direct | 5 | 55.89 | 1661.05 | 35.77 | 139.15 |
| firefox / basis | 5 | 15.99 | 1508.21 | 46.35 | 157.57 |
| manimgl / manimgl | 6 | 91.59 | 424.05 | 15.23 | 268.64 |
| chromium / basis | 5 | 21.99 | 1285.27 | 46.13 | 89.98 |
| chromium / tiled | 5 | 17.99 | 1261.36 | 47.02 | 86.08 |
| firefox / basis | 5 | 143.95 | 1615.05 | 41.72 | 139.20 |
| firefox / tiled | 5 | 30.02 | 1490.41 | 45.40 | 168.15 |
| manimgl / manimgl | 6 | 97.81 | 429.86 | 15.87 | 268.64 |

## Visual evidence

Five identical animation phases are captured per mode and browser. Gates require nonempty frames, visible motion, mean channel error ≤0.5, interior p99 channel error ≤2, and silhouette mismatch ≤0.2%. Difference panels amplify errors by 16×. These are lossless framebuffer captures; labeled sheets are reduced previews.

- chromium: parity **passed**; [metrics](runs/2026-11-06T13-39-39-223Z-466065-parity-chromium/parity.json), [direct contact sheet](runs/2026-11-06T13-39-39-223Z-466065-parity-chromium/direct-comparison.png), [basis contact sheet](runs/2026-11-06T13-39-39-223Z-466065-parity-chromium/basis-comparison.png).
- firefox: parity **passed**; [metrics](runs/2026-11-06T13-40-17-857Z-466065-parity-firefox/parity.json), [direct contact sheet](runs/2026-11-06T13-40-17-857Z-466065-parity-firefox/direct-comparison.png), [basis contact sheet](runs/2026-11-06T13-40-17-857Z-466065-parity-firefox/basis-comparison.png).
- chromium: parity **passed**; [metrics](runs/2026-11-06T13-44-15-965Z-474649-parity-chromium/parity.json), [basis contact sheet](runs/2026-11-06T13-44-15-965Z-474649-parity-chromium/basis-comparison.png), [tiled contact sheet](runs/2026-11-06T13-44-15-965Z-474649-parity-chromium/tiled-comparison.png).
- firefox: parity **passed**; [metrics](runs/2026-11-06T13-44-56-726Z-474649-parity-firefox/parity.json), [basis contact sheet](runs/2026-11-06T13-44-56-726Z-474649-parity-firefox/basis-comparison.png), [tiled contact sheet](runs/2026-11-06T13-44-56-726Z-474649-parity-firefox/tiled-comparison.png).

## Attempts

All attempted runs, including instrumentation failures and diagnostic timing, remain recorded. Earlier gl.finish-only measurements are excluded from completion speedups.

- [2026-11-06T13-30-09-540Z-451402-parity-manimgl](runs/2026-11-06T13-30-09-540Z-451402-parity-manimgl/result.json): invalid-timing.
- [2026-11-06T13-30-23-996Z-451402-parity-chromium](runs/2026-11-06T13-30-23-996Z-451402-parity-chromium/result.json): diagnostic.
- [2026-11-06T13-33-47-401Z-456982-parity-manimgl](runs/2026-11-06T13-33-47-401Z-456982-parity-manimgl/result.json): failed.
- [2026-11-06T13-35-09-042Z-458938-parity-manimgl](runs/2026-11-06T13-35-09-042Z-458938-parity-manimgl/result.json): complete.
- [2026-11-06T13-35-28-173Z-458938-parity-chromium](runs/2026-11-06T13-35-28-173Z-458938-parity-chromium/result.json): diagnostic.
- [2026-11-06T13-35-53-062Z-458938-parity-firefox](runs/2026-11-06T13-35-53-062Z-458938-parity-firefox/result.json): diagnostic.
- [2026-11-06T13-39-11-269Z-466065-parity-manimgl](runs/2026-11-06T13-39-11-269Z-466065-parity-manimgl/result.json): complete.
- [2026-11-06T13-39-39-223Z-466065-parity-chromium](runs/2026-11-06T13-39-39-223Z-466065-parity-chromium/result.json): complete.
- [2026-11-06T13-40-17-857Z-466065-parity-firefox](runs/2026-11-06T13-40-17-857Z-466065-parity-firefox/result.json): complete.
- [2026-11-06T13-43-34-404Z-474649-parity-manimgl](runs/2026-11-06T13-43-34-404Z-474649-parity-manimgl/result.json): complete.
- [2026-11-06T13-44-15-965Z-474649-parity-chromium](runs/2026-11-06T13-44-15-965Z-474649-parity-chromium/result.json): complete.
- [2026-11-06T13-44-56-726Z-474649-parity-firefox](runs/2026-11-06T13-44-56-726Z-474649-parity-firefox/result.json): complete.
- [2026-11-06T13-47-56-568Z-482068-parity-manimgl](runs/2026-11-06T13-47-56-568Z-482068-parity-manimgl/result.json): complete.

Regenerate with `npm run report:parity`. [Structured data](parity-summary.json).
