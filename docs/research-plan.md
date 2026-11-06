# ManimJS research protocol

## Product boundary

Build a general-purpose JavaScript mathematical graphics and animation library. Reuse the browser's low-level graphics APIs directly. No Three.js runtime, automatic Python conversion, topology-only core, or theorem-prover dependency. Topology articles exercise the library and supply motivating examples.

Develop one capability at a time: define its visual/numerical contract, establish a baseline, compare alternatives, record raw measurements and limitations, then choose the smallest API that supports demonstrated needs. Development time is not the primary constraint. Accuracy, consistent frame pacing, loading cost, memory use and hardware efficiency all matter.

Distribution constraint: ship a self-contained classic JavaScript file usable from an ordinary HTML script tag, plus an independent ES-module build. Source remains modular. Optional heavy workloads, authoring tools and research checkouts must not silently enter the core bundle.

## Resource and latency logging

The new fluid, representation and compatibility runners use `scripts/lib/telemetry.mjs` and unique timestamped `results/runs/` directories. Preserve both `result.json` and `telemetry.json`, including unsuccessful attempts. Earlier experiment-001 records predate this instrumentation and cannot be retroactively assigned resource samples.

| Metric                                | Meaning and limitation                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node CPU time / sampled CPU percent   | Process user+system time; 100% represents one logical core. Software GPU worker threads count as CPU work.                                                                                             |
| Process-tree CPU/RSS                  | Linux procfs samples include observable descendants; shared RSS may count twice and short-lived processes may be missed.                                                                               |
| RSS, heapUsed, external, arrayBuffers | Node-process counters. They are not the browser's JavaScript heap or total driver memory.                                                                                                              |
| GPU buffer/texture bytes              | Explicit allocations counted by the workload; excludes allocator padding beyond recorded buffer size, driver allocations and caches.                                                                   |
| GPU busy / VRAM                       | Readable device counters when available; device-wide, not exclusive to this benchmark. Missing is null.                                                                                                |
| GPU compute/render timestamps         | Optional adapter feature; sampled pass duration, with ordinary implementation precision/quantization. Readback is outside measured batches.                                                            |
| Submission ms                         | CPU time to encode and enqueue work; does not include GPU completion.                                                                                                                                  |
| Drained batch ms per step             | Wall-clock batch duration divided by steps after queue completion. Percentiles describe batch averages, not individual frame/input latency.                                                            |
| Event-loop delay                      | Node scheduler delay, not browser presentation or input-to-photon latency.                                                                                                                             |
| Numerical/error counters              | Nonfinite values, independent reference error, divergence residual, dye mass drift, output coverage, API validation errors and run status. Denominators are completed checks, not all rendered pixels. |

Sampled peaks can miss brief spikes. Telemetry itself adds overhead; compare equally instrumented runs. The current short experiments are not enough to estimate rare p99 stalls or thermal steady state. Browser rAF pacing is measured separately by `bench:browser`; real input-to-photon and power consumption need additional device instrumentation.

## Stress workload coverage

`experiments/fluid/` stresses compute dispatches, read/write bandwidth, pressure iterations and fullscreen rendering. It has an independent float64 CPU projection oracle, a constant-field transport test, finite-value/dye-bound gates, and logged divergence and mass drift. A fixed pressure iteration count is an approximation; do not compare different iteration counts as equal-quality speedups without matching residual error.

The normal suite uses 128²/256² cells, 40 iterations, two workgroup sizes and three rounds. The heavy real-device suite uses 256²/512² and 80 iterations. Missing WebGPU on Firefox is an unavailable stress path, not evidence that the WebGL2 grid failed. No full fluid WebGL2 implementation is claimed.

Next workload gaps: many independent objects/materials and changing visibility, high-curvature/translucent strokes, large triangle surfaces, text-heavy scenes, sustained thermal runs, device/context loss and measured user input response. Keep these distinct; one fast fluid solver cannot validate the whole library.

## Experiment 001: parameterized geometry updates

Fixture: an indexed grid deformed by H(x,y) = (x + a sin(3y + phase), y). It has the explicit inverse (x - a sin(3y + phase), y); the animation does not require tearing, folding, mesh connectivity changes, or expensive numerical integration.

The same formula, grid resolution, color, line rasterization and target size are used across variants. This is intentionally not a representative benchmark of all mathematics or all Manim features.

| Strategy      | Per-frame work                                              | Question                                            |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| cpu-naive     | Evaluate every vertex in JS and upload all coordinates      | Baseline                                            |
| cpu-rows      | Evaluate one sine per row and upload all coordinates        | How much redundant math can be removed?             |
| cpu-basis     | Combine precomputed row sine/cosine, upload coordinates     | Does avoiding repeated transcendental work help?    |
| vertex        | Upload parameters; deform stored positions in vertex shader | Can static geometry stay resident?                  |
| basis         | Store position plus sine/cosine; simple shader arithmetic   | Accuracy/compute cost versus extra vertex bandwidth |
| procedural    | Reconstruct positions from vertex indices                   | Less memory versus integer arithmetic               |
| row-table     | JS computes one offset per row; upload small table          | Hybrid CPU/GPU separability                         |
| compute       | Compute positions into a buffer, then render                | Cost of a separate pass and intermediate storage    |
| compute-basis | Compute using precomputed trigonometric basis               | Precision and bandwidth tradeoff                    |
| vertex-bundle | Pre-record static render commands                           | Does command reuse help for one draw?               |

Known restrictions: one-pixel indexed lines, no MSAA, opaque color, one draw, one deformation, fixed resolution, no text or hit testing. GPU buffer bytes exclude driver allocation and CPU fixtures. Browser tests use normal timestamp quantization. Native Dawn uses its defaults. No timestamp resolution override is used.

## Measurement rules

1. Record backend, adapter/fallback status, browser/runtime, dimensions, workload, source version, flags, timing method, and correctness results.
2. Treat software rendering, native hardware, and browser hardware as different populations. Never merge them into a single ranking.
3. Warm up before steady-state timing; preserve setup timings separately. Pipeline creation cache state is not controlled, so recorded setup times do not establish cold-start performance.
4. Shuffle case order with a recorded seed and repeat rounds. Preserve samples and distributions. Do not report the fastest trial as the result.
5. Separate JS update, upload API call time, encoding/submit time, GPU pass time, drained batch throughput, and browser rAF pacing. The timelines overlap.
6. Do not fence every animation frame. Batch fences are allowed only in the explicitly labeled throughput experiment. Query readback occurs outside its timed section.
7. Gate performance results on nonempty output, pixel comparisons and analytic coordinate checks. Report approximations and precision budgets.
8. Do not equate rAF pacing to input-to-photon latency. A real interaction test needs event timestamps, presentation instrumentation and physical-device testing.
9. Stop drawing static and hidden scenes. Measure scheduling and resource lifecycle independently from shader throughput.
10. Preserve pending decisions. A software result cannot establish whether WebGPU, WebGL2, Canvas2D, workers, WASM, or a custom allocator is the best general choice.

## Performance targets to validate

- Smooth interaction: target a stable 60 Hz experience on an agreed baseline mobile/integrated device; 120 Hz where hardware/workload permits. A 60 Hz refresh gives 16.67 ms for the whole frame, not just JavaScript or shader execution.
- Idle scenes: zero ongoing animation callbacks after the scene settles or is hidden.
- Memory: resource lifetimes are explicit; unmounted scenes release owned resources. Repeated mount/unmount measurement is a future gate.
- Loading: publish gzip/brotli module sizes and first-interaction timing once there is a real distributable renderer. Do not choose a speculative bundle-size limit before measuring the feature.
- Quality: line/text quality and mathematical error have explicit tolerances. No quality reduction hidden inside a speed claim.

## Sequence after this experiment

1. **Hardware/browser validation:** run the existing harness, including default-browser availability and presentation. Compare WebGL2 against WebGPU using equal output and feature scope.
2. **Curves and strokes:** compare tessellated triangles, analytic distance methods and adaptive subdivision at equal visible error. Topology diagrams need clear lines before complex surfaces.
3. **Interaction and timing:** picking, draggable parameters, seekable transitions and low input latency. Keep high-frequency values outside UI reconciliation.
4. **Multiple embeds and batching:** compare scissored shared canvases versus separate contexts, resource sharing, visibility thresholds and worker rendering. Optimize against an actual article layout.
5. **Text and equations:** evaluate cached glyph/path rendering, accessibility and layout. Do not rebuild glyphs while only positions change.
6. **Surfaces:** parameterized meshes, GPU deformation, camera controls and edge-identification diagrams. Test precision and numerical stability at larger scales.

Do not begin all six at once. The next accepted feature should be backed by a repeatable experiment and a small usable example.

## Research basis

- [WebGPU specification](https://www.w3.org/TR/webgpu/): distinct content/device/queue timelines, resource usage and optional timestamps.
- [WGSL numerical accuracy](https://www.w3.org/TR/WGSL/#floating-point-accuracy): trigonometric functions have explicit error allowances; mathematical visualization must account for them.
- [Chrome WebGPU developer features](https://developer.chrome.com/docs/web-platform/webgpu/developer-features): ordinary timestamp queries are quantized; disabling this is a development-only behavior.
- [wgpu performance guidance](https://wgpu.rs/doc/wgpu/documentation/best_practices/dos_and_donts/index.html): avoid per-frame resource churn and excessive submissions; organize bindings by change frequency.
- [Dawn Node binding](https://github.com/dawn-gpu/node-webgpu): offscreen render/compute execution is available without browser presentation.
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas): worker rendering is possible, but is a candidate to measure rather than a guaranteed optimization.
- [shadcn architecture](https://ui.shadcn.com/docs): composable editable examples can coexist with a versioned low-level engine.

## Hardware measurement follow-up

The browser runners record six empty submission/completion round trips separately from the simulation. Firefox on this machine takes about 100 ms per completion callback even for empty work; a three-step drained batch therefore reports about 33 ms/step without establishing GPU execution time or display FPS. Compare GPU timestamps and presentation measurements separately.

Linux resource sampling now includes [DRM client statistics](https://www.kernel.org/doc/html/next/gpu/drm-usage-stats.html) for the runner's process tree. Device/client IDs deduplicate shared file descriptors. Engine counters measure elapsed active time, with 100% representing one engine; they are not frequency-normalized whole-GPU utilization. Memory categories overlap. NVIDIA device-wide counters and Intel client counters are separate fields. The sampler records its own elapsed work time, and old/new instrumentation should not be treated as identical experimental conditions.
