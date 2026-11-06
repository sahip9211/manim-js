# Shared geometry and bounded tessellation

This experiment changes the representation of the same shear-grid fixture. The original indexed grid, shared full-resolution curves, and shared curves with a pixel-error budget use the same basis shader and framebuffer. The last variant intentionally changes vertical tessellation.

Results below are the median of three round medians from [the original raw run](representation-software.json). Each round uses six batches of eight frames after twelve warmup frames. Backend: native Dawn with SwiftShader software Vulkan, not a browser or physical GPU. Background machine activity was not controlled, so these are exploratory measurements.

| 256 by 256 grid | Segments | Geometry bytes | Median drained batch ms per frame |
|---|---:|---:|---:|
| Expanded indexed grid | 130,560 | 1,570,832 | 97.671 |
| Shared curves, original vertical samples | 65,536 | 13,344 | 46.488 |
| Shared curves, bounded interpolation | 8,192 | 8,864 | 19.746 |

The bounded variant is about **4.95 times faster in this software run**, with **99.44% less geometry storage**. Full-resolution instancing is about 2.10 times faster. These ratios do not establish a hardware winner. At 128 by 128, the corresponding times were 25.230, 16.392 and 13.777 ms. All variants upload 16 bytes of parameters per frame; the shared representations use two draws rather than one.

At framebuffer width 640, scale 0.65 and maximum amplitude 0.25, 31 vertical segments bound analytic interpolation error by approximately 0.2435 pixels. This bound excludes floating-point and line-rasterization error. A changed width, scale or amplitude range requires rebuilding the geometry. Horizontal-row collapse preserves the geometric line but can alter rasterization at former segment endpoints.

Validation: 18 native image cases passed bidirectional stroke-coverage checks at a two-pixel radius. This is a nonempty-output and gross-geometry gate, not a subpixel antialiasing quality test. Independent tests check the analytic interpolation bound over several phases, amplitude signs and framebuffer sizes, stored geometry coordinates, indices and parameter limits.

The classic-script bundle also renders through a simulated canvas backed by real Dawn in [the bundle check](standalone-native.json), with [an output image](standalone-native.png). That host is explicitly not a browser. An initial check harness aborted in Dawn's event processing after dropping its native GPU owner; retaining that owner through asynchronous work resolved the observed failure. No application data was involved.

New executions use unique directories under `results/runs/` and include telemetry. The original data remains intact. Commands:

```sh
npm run bench:representation -- --software
npm run build
npm run check:build -- --software
npm run check:browsers
```
