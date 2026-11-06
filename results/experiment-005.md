# Vectorized pressure execution

The fluid experiment now defaults to `packed4-readonly`: four adjacent cells per invocation, a 64×1 pressure workgroup, read-only divergence access and a minimal pressure bind group. The first Jacobi iteration is fused into divergence, removing two pressure clears and one dispatch. The heavy comparisons still perform the same mathematical 80 iterations, with unchanged float32 precision, timestep and rendering.

On the default 8×8 workgroup for the other simulation stages, paired browser comparisons reduced GPU compute time by **1.55–2.29×** at 256²/512². Results vary with workgroup and driver; Chromium at 256² with the explicitly selected 16×16 workgroup regressed. This is a measured default for the current fixture, not a universal tuning result.

The single-file library remains 11,580 bytes / 4,902 gzip. These stress shaders, profiler and research variants remain outside its distribution.

## Paired results

Each row uses twelve last-step GPU samples across three shuffled rounds. Compute times include advection, divergence, pressure and projection, but exclude render time, CPU scheduling and readback. Every timed case advances twelve simulation steps (four batches of three). The entire comparison has 36 cases and 432 timed steps. Browser measurements use experimental WebGPU settings and workspace 5; Firefox reports a hidden page, Chromium reports visible. Do not infer display FPS or rank browsers from these rows.

| Runtime | Grid | Other stages WG | Previous direct GPU ms | New GPU ms | Ratio |
|---|---:|---:|---:|---:|---:|
| Chromium 155 | 256² | 8×8 | 8.110 | 4.202 | 1.93× |
| Chromium 155 | 256² | 16×16 | 4.336 | 5.094 | 0.85× |
| Chromium 155 | 512² | 8×8 | 34.209 | 21.998 | 1.56× |
| Chromium 155 | 512² | 16×16 | 22.555 | 17.767 | 1.27× |
| Firefox 158 | 256² | 8×8 | 8.485 | 5.128 | 1.65× |
| Firefox 158 | 256² | 16×16 | 6.388 | 5.202 | 1.23× |
| Firefox 158 | 512² | 8×8 | 47.671 | 20.845 | 2.29× |
| Firefox 158 | 512² | 16×16 | 25.859 | 20.821 | 1.24× |
| Native Intel | 256² | 8×8 | 10.387 | 4.981 | 2.09× |
| Native Intel | 256² | 16×16 | 7.373 | 6.783 | 1.09× |
| Native Intel | 512² | 8×8 | 41.189 | 21.692 | 1.90× |
| Native Intel | 512² | 16×16 | 25.625 | 26.247 | 0.98× |
| Native NVIDIA MX250 | 256² | 8×8 | 1.868 | 1.442 | 1.30× |
| Native NVIDIA MX250 | 256² | 16×16 | 1.769 | 1.442 | 1.23× |
| Native NVIDIA MX250 | 512² | 8×8 | 7.012 | 6.750 | 1.04× |
| Native NVIDIA MX250 | 512² | 16×16 | 6.816 | 6.652 | 1.02× |

Only within-run ratios are meaningful here. These short experiments ran on an active desktop; load, clocks and thermal conditions were not fixed. Small differences between vector layouts are inconclusive. GPU timestamps, CPU submission, drained batch time and setup time remain separate in raw data.

## Correctness and resources

Each of the four full comparisons passed **114 reference/equivalence checks plus 36 timed-state checks**, with zero uncaptured GPU errors. The maximum error against the independent float64 projection reference was 7.153×10⁻⁷; evolved float32 fields matched exactly between the direct, packed-strip and packed-readonly variants in every timed case.

Tests cover dimensions 8, 12, 17, 20, 32 and 36; one, three and forty iterations; both workgroup sizes; and eight evolving steps with 41 iterations. The optimized kernel falls back to scalar indexing when the grid width is not divisible by four. The one-iteration case verifies the fused initialization, and evolving steps exercise reuse without pressure-buffer clears.

- Chromium 155: [results](runs/2026-11-06T11-28-35-952Z-270739-pressure-chromium/result.json), [telemetry](runs/2026-11-06T11-28-35-952Z-270739-pressure-chromium/telemetry.json), frozen source snapshots alongside. 79 samples over 38.9 s; peak summed process-tree RSS 1288.3 MiB.
- Firefox 158: [results](runs/2026-11-06T11-29-14-866Z-270739-pressure-firefox/result.json), [telemetry](runs/2026-11-06T11-29-14-866Z-270739-pressure-firefox/telemetry.json), frozen source snapshots alongside. 166 samples over 82.6 s; peak summed process-tree RSS 1617.6 MiB.
- Native Intel: [results](runs/2026-11-06T11-27-36-366Z-269185-pressure-hardware/result.json), [telemetry](runs/2026-11-06T11-27-36-366Z-269185-pressure-hardware/telemetry.json), frozen source snapshots alongside. 51 samples over 26.9 s; peak summed process-tree RSS 219.8 MiB.
- Native NVIDIA MX250: [results](runs/2026-11-06T11-31-35-182Z-276368-pressure-hardware/result.json), [telemetry](runs/2026-11-06T11-31-35-182Z-276368-pressure-hardware/telemetry.json), frozen source snapshots alongside. 42 samples over 21.0 s; peak summed process-tree RSS 288.2 MiB.

Memory figures include runner/browser/driver processes and may double-count shared pages; they are not the solver allocation size. Logs retain workload buffer/texture bytes, process CPU/RAM, Node heap, device-wide NVIDIA counters, Intel DRM client counters, sampler overhead, all timing samples and errors. Solver convergence and semi-Lagrangian dye-mass limitations are unchanged.

## Experiments retained

- [Stage profile](runs/2026-11-06T11-18-50-450Z-255531-fluid-stage-profile/result.json): pressure dominated execution. The profiler splits compute passes to obtain stage timestamps and validates its output against the ordinary pass. These diagnostic boundaries add overhead.
- [Fixed-grid specialization and four/eight-iteration temporal blocking](runs/2026-11-06T11-11-53-967Z-245421-pressure-hardware/result.json): correct output, but no reliable large-grid improvement; shared-memory variants regressed. They remain research options, not defaults.
- [Four/eight-cell vectorization](runs/2026-11-06T11-17-52-455Z-254260-pressure-hardware/result.json): four cells were preferable; the eight-cell variant was slower in this comparison.
- [Thread layout comparison on Intel](runs/2026-11-06T11-20-40-138Z-257767-pressure-hardware/result.json) and [NVIDIA](runs/2026-11-06T11-21-43-119Z-260007-pressure-hardware/result.json): tested square, 32×4 and 64×1 layouts. No layout was universally fastest.

The subsequent fused/read-only comparisons above are the evidence for the selected default. Older timings use different source versions and instrumentation histories; they are not pooled into one ranking.

## Workspace and reproduction

Headed test windows use a dedicated class and open silently on workspace 5. Placement is checked before measurements. No workspace-switch command is issued. Firefox reuses its temporary profile's initial tab to avoid waiting for focus when creating another tab. Hidden-page animation checks are marked skipped; image/numerical compute checks still run. See [desktop setup](../docs/real-device-testing.md#keep-tests-on-workspace-5).

```sh
npm run bench:pressure:browser -- --headed --system-firefox --experimental-webgpu --heavy --readonly
npm run bench:pressure -- --heavy --readonly
MANIM_JS_ADAPTER='NVIDIA GeForce MX250' npm run bench:pressure -- --heavy --readonly
npm run profile:fluid
npm run test:real -- --quick --system-firefox --experimental-webgpu
npm run report:runs
```

`--candidates`, `--packed` and `--layouts` retain the rejected or mixed-result alternatives. All GPU timing variants keep solver settings equal. No neural approximation or reduced precision was introduced.

Research basis: [NVIDIA stencil data-reuse guidance](https://developer.nvidia.com/blog/finite-difference-methods-cuda-cc-part-1/), [temporal-blocking research](https://arxiv.org/abs/2001.01473), and the [WGSL memory and execution specification](https://gpuweb.github.io/gpuweb/wgsl/). These motivated candidates; local measurements determine the current choice.

## Final validation

The final default passed the browser fluid smoke suites in [Chromium](runs/2026-11-06T11-36-20-973Z-283164-fluid-chromium/result.json) and [Firefox](runs/2026-11-06T11-36-27-397Z-283164-fluid-firefox/result.json), including fused initialization. Unit tests (13), the unchanged standalone builds, browser pressure validation and native pressure validation passed in the [regression run](runs/2026-11-06T11-32-46-123Z-277714-real-device/result.json). That launcher retains an `incomplete` status because its earlier Firefox animation check waited for frames in an inactive workspace and was stopped. The harness now skips that foreground-only check based on workspace placement and bounds any animation wait. Its separate compatibility rerun is recorded below.

The corrected compatibility rerun passed in [Chromium](runs/2026-11-06T11-37-38-979Z-286100-compatibility-chromium/result.json) and [Firefox](runs/2026-11-06T11-37-59-363Z-286100-compatibility-firefox/result.json), with workspace 5 verified and background animation checks explicitly skipped. [Combined validation record](validation-latest.json).
