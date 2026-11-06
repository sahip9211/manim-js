# Experiment 012: parametric Surface and Transform

A general user-supplied parameter map and target map are sampled once. The GPU interpolates endpoints and RGB colors, then constructs normals from the interpolated geometry. The pinned ManimGL reference uses its actual `Transform(surface, target, rate_func=linear)` implementation, with matching sample grids and colors. This verifies an opaque, same-grid straight-path subset, not all Transform behavior.

## Measurements

| Run / browser / mode | Completed batch ms/frame | GPU ms/frame | CPU % | GPU render % | Browser PSS MiB | Index bytes | Owned GPU textures MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-11-06T15-13-06 / manimgl / ManimGL Transform | 9.018 | 4.050 | 94.1 | 48.7 | — | — | 7.031 |
| 2026-11-06T15-13-22 / chromium / gpu8 | 1.434 | 0.796 | 22.0 | 58.3 | 453.4 | 768 | 11.055 |
| 2026-11-06T15-13-22 / chromium / gpu32 | 1.227 | 0.733 | 22.0 | 58.0 | 450.8 | 12288 | 11.055 |
| 2026-11-06T15-13-42 / firefox / gpu8 | 1.706 | — | 22.0 | 55.7 | 597.2 | 768 | 11.055 |
| 2026-11-06T15-13-42 / firefox / gpu32 | 1.491 | — | 18.0 | 60.2 | 576.8 | 12288 | 11.055 |

Medians average the two middle samples for even counts and summarize completed batch averages, not display FPS or input latency. GPU timers are unavailable in this Firefox configuration. CPU 100% is one core. GPU utilization is Intel render-client busy time. Cases alternate order across rounds inside a fresh browser session; PSS snapshots include browser startup, earlier cases, caches and automation and are not isolated scene increments. Do not compare those PSS snapshots as a causal memory-saving percentage. Explicit textures include library color/depth targets and exclude the browser framebuffer. The JSON summary includes setup, CPU/GPU statistics, RSS, PSS, resident GPU memory, and retained errors.

## API and performance contract

`ManimJS.experimental.createSurface(canvas, { map, targetMap, uRange, vRange, uSegments, vSegments, color, targetColor, duration, easing })` creates a seekable surface. `seek(progress)` renders synchronously, `play()` runs once to the target, `pause()` suspends playback, and `dispose()` releases resources. Playback stops scheduling work after completion and while hidden. `easing` is `linear` or ManimGL-style quintic `smooth`.

Maps are sampled only at creation. Each endpoint stores float32 xyz plus RGB8 packed exactly into a float32 integer. Two 513×257 RGBA32F textures use 4.023 MiB; a static surface shares one endpoint texture. Each frame uploads one alpha float (4 bytes), with no geometry upload or CPU interpolation. Sampling has an upfront CPU/memory cost recorded separately; throughput excludes setup in both implementations. RGB8 endpoint quantization is explicit and matched by the native fixture. Opacity, curved transform paths, unequal resolutions, dynamic remeshing, imported meshes and multiple-object scenes are not supported by this API.

Native and browser capture five equally specified progress values. Intermediate colors interpolate after unpacking; normals are computed from intermediate points rather than interpolating precomputed normals. The pole-neighbor fallback follows the pinned ManimGL surface shader. The benchmark validates the dense torus-to-deformed-torus transform; it does not establish visual parity for every user map. See [feature coverage](../docs/feature-parity.md) and [the runnable example](../examples/surface-morph.html).

## Retained attempts

- [2026-11-06T15-11-29-450Z-621096-morph-manimgl](runs/2026-11-06T15-11-29-450Z-621096-morph-manimgl/result.json): failed, parity not applicable/incomplete; see retained error.
- [2026-11-06T15-13-06-441Z-623413-morph-manimgl](runs/2026-11-06T15-13-06-441Z-623413-morph-manimgl/result.json): complete, parity not applicable/incomplete.
- [2026-11-06T15-13-22-479Z-623413-morph-chromium](runs/2026-11-06T15-13-22-479Z-623413-morph-chromium/result.json): complete, parity passed.
  - [gpu8 frame comparisons](runs/2026-11-06T15-13-22-479Z-623413-morph-chromium/gpu8-comparison.png).
  - [gpu32 frame comparisons](runs/2026-11-06T15-13-22-479Z-623413-morph-chromium/gpu32-comparison.png).
- [2026-11-06T15-13-42-174Z-623413-morph-firefox](runs/2026-11-06T15-13-42-174Z-623413-morph-firefox/result.json): complete, parity passed.
  - [gpu8 frame comparisons](runs/2026-11-06T15-13-42-174Z-623413-morph-firefox/gpu8-comparison.png).
  - [gpu32 frame comparisons](runs/2026-11-06T15-13-42-174Z-623413-morph-firefox/gpu32-comparison.png).

The first native attempt failed while reading an instrumentation-only byte counter (`StructuredArray.nbytes`); the pinned API exposes `StructuredArray.array.nbytes`. Its error, captures and source snapshot are retained. It supplies no successful performance result. The runner now preserves a partial native report if a later attempt fails.

Reproduce: `npm run bench:morph`. Native dependencies and the ignored reference checkout are described in [the parity guide](../docs/manimgl-parity.md).
Regenerate both reports with `npm run report:surfaces`.
