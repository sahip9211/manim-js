# Hardware and browser measurements

Measured on 6 November 2026 on the available desktop. The single-file example works in installed Chromium 155.0.8059.84 and Firefox 158.0.1 using WebGL2 with default GPU settings. This first hardware round established direct indexing as the pressure default. The subsequent [vectorization experiment](experiment-005.md) replaces it with a faster default while preserving output. The exported library still excludes the fluid stress code.

## Browser compatibility

| Configuration | WebGL2 image checks | WebGPU image checks | Standalone HTML |
|---|---|---|---|
| Chromium defaults | 9 passed | Adapter unavailable | Passed |
| Firefox defaults | 9 passed | Adapter unavailable | Passed |
| Chromium experimental WebGPU | 9 passed | 9 passed, cross-backend coverage passed | Passed |
| Firefox experimental WebGPU | 9 passed | 9 passed, cross-backend coverage passed | Passed |

Default results: [Chromium](compatibility-chromium.json), [Firefox](compatibility-firefox.json). Experimental results: [Chromium](compatibility-chromium-experimental.json), [Firefox](compatibility-firefox-experimental.json). Experimental settings apply only to disposable test profiles; they are not default-browser support claims. Firefox is the installed browser driven by WebDriver BiDi, not the older Playwright download. Its WebGPU adapter description is redacted; later DRM samples record Intel i915 clients.

The [complete quick validation run](runs/2026-11-06T10-49-31-535Z-212766-real-device/result.json) passed unit tests (13), both builds, browser compatibility, browser fluid/pressure and native pressure checks. The classic bundle is 11,580 bytes, 4,902 gzip, with zero runtime imports.

## Pressure comparison

Every kernel uses the same initial field, timestep, 40 pressure iterations and rendering. Three rounds use shuffled kernel order. Each configuration has twelve GPU samples (one final step per timed batch); the values below are their medians. They measure the whole compute pass, including advection/divergence/projection, and exclude rendering. Ratios compare kernels within a run, not browsers against one another.

| Runtime | Grid / workgroup | Original GPU ms | Direct GPU ms | Tiled pair GPU ms | Original / direct |
|---|---|---:|---:|---:|---:|
| Chromium 155 / Intel | 128² / 16×16 | 1.617 | 0.885 | 0.924 | 1.83× |
| Chromium 155 / Intel | 256² / 16×16 | 6.367 | 2.080 | 2.938 | 3.06× |
| Firefox 158 / redacted adapter | 128² / 16×16 | 1.106 | 0.592 | 0.784 | 1.87× |
| Firefox 158 / redacted adapter | 256² / 16×16 | 5.099 | 2.201 | 3.243 | 2.32× |
| Native Dawn / MX250 | 128² / 16×16 | 0.754 | 0.197 | 0.360 | 3.83× |
| Native Dawn / MX250 | 256² / 16×16 | 2.556 | 0.983 | 1.245 | 2.60× |

Both 8×8 and 16×16 workgroups are retained in the raw data. Each of these full runs passed 60 reference/equivalence checks and 36 timed numerical checks, with zero uncaptured GPU validation errors and zero final-field difference between the kernels. The tiled kernel sometimes improved drained wall time but did not consistently beat direct indexing in GPU compute time. It remains an explicit option. The implementation also avoids compiling unused pressure pipelines.

- Chromium 155 / Intel: [raw results](runs/2026-11-06T10-45-03-727Z-205058-pressure-chromium/result.json), [resource telemetry](runs/2026-11-06T10-45-03-727Z-205058-pressure-chromium/telemetry.json).
- Firefox 158 / redacted adapter: [raw results](runs/2026-11-06T10-45-20-869Z-205058-pressure-firefox/result.json), [resource telemetry](runs/2026-11-06T10-45-20-869Z-205058-pressure-firefox/telemetry.json).
- Native Dawn / MX250: [raw results](runs/2026-11-06T10-43-23-605Z-200733-pressure-hardware/result.json), [resource telemetry](runs/2026-11-06T10-43-23-605Z-200733-pressure-hardware/telemetry.json).
- Native Intel: [raw results](runs/2026-11-06T10-37-54-356Z-191785-pressure-hardware/result.json), [telemetry](runs/2026-11-06T10-37-54-356Z-191785-pressure-hardware/telemetry.json). This earlier two-kernel run passed 84 checks; small-grid timings were noisy and did not establish a consistent direct-index advantage.

These are short runs on an active desktop, not controlled thermal trials or proof of a universal optimum. Native and browser results use different API implementations and timestamp precision. Source snapshots preserve the tested shader/solver versions.

## Heavy fluid workload

The corrected heavy runs each completed 240 timed fluid steps over twelve cases: 256² and 512² cells, 80 pressure iterations, 8×8 and 16×16 workgroups, and three rounds. Both browsers passed the two independent reference checks and every case's finite-value, dye-bound, divergence and nonempty-image gates, with no uncaptured GPU or page errors. These runs use the new direct-index default.

| Browser | Grid / workgroup | GPU compute ms | Drained batch ms/step | CPU submission ms/step |
|---|---|---:|---:|---:|
| Chromium | 256² / 16×16 | 3.259 | 4.336 | 0.105 |
| Chromium | 512² / 16×16 | 17.332 | 18.681 | 0.095 |
| Firefox | 256² / 16×16 | 2.418 | 25.065 | 0.155 |
| Firefox | 512² / 16×16 | 16.910 | 25.105 | 0.175 |

GPU compute values are medians of fifteen last-step samples; drained/submission values are medians of three round medians. These are offscreen stress measurements, not displayed frame rates. Firefox callback delay dominates the drained metric. Both workgroup sizes and all raw timings are saved.

- Chromium: [raw samples](runs/2026-11-06T10-51-13-217Z-217793-fluid-chromium/result.json), [telemetry](runs/2026-11-06T10-51-13-217Z-217793-fluid-chromium/telemetry.json), frozen sources alongside. 17 resource samples over 7.6 s; peak summed process-tree RSS 1260.5 MiB; peak Node heap 46.1 MiB. DRM clients: i915 0000:00:02.0. Median empty submission/completion round trip: 0.71 ms.
- Firefox: [raw samples](runs/2026-11-06T10-51-20-863Z-217793-fluid-firefox/result.json), [telemetry](runs/2026-11-06T10-51-20-863Z-217793-fluid-firefox/telemetry.json), frozen sources alongside. 59 resource samples over 28.8 s; peak summed process-tree RSS 1674.5 MiB; peak Node heap 59.7 MiB. DRM clients: i915 0000:00:02.0. Median empty submission/completion round trip: 100.16 ms.

The solver is semi-Lagrangian dye advection with an approximate fixed-iteration pressure solve and periodic boundaries, not free-surface water. Passing divergence checks means projection reduced divergence; it does not establish full convergence. Dye mass drift is measured and retained. Workload buffer/texture byte counts exclude browser/driver allocations.

## Completion delay and resource measurements

Firefox reported approximately 33.4 ms per step in three-step drained batches even when GPU compute time fell below 1 ms. A subsequent empty-submission probe measured approximately 100 ms for the queue completion callback. This explains why that throughput experiment cannot be interpreted as displayed FPS. The runtime frame loop does not wait for GPU completion every animation frame.

Logs include raw CPU submission/batch timings, GPU compute/render timestamps, numerical errors, Node memory, sampled process-tree CPU/RSS, whole-device NVIDIA utilization/VRAM and, in newer runs, Intel DRM client engine/memory statistics. Missing counters remain null. Node heap is not browser JS heap; process-tree RSS double-counts shared pages; DRM memory categories overlap. NVIDIA counters cannot describe Intel work. Input-to-photon latency is not measured.

The sampler logs its own elapsed work. Reducing procfs reads and avoiding thread-pool work for tiny procfs files reduced its overhead in the smoke runs, but workload-dependent scheduling still affects it. The heavy reruns use the updated sampler; do not compare old/new drained timings as a controlled kernel-only change.

## Reproduce

See [real-device commands and launch settings](../docs/real-device-testing.md). Default-browser and experimental-WebGPU runs remain separate, and software adapters are rejected for hardware runs. Historical permission failures and the Firefox run that caught a missing lab script are retained as unsuccessful attempts. The lab URL was corrected, and subsequent complete tests passed.
