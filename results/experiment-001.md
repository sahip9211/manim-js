# Experiment 001: deforming indexed grid

ManimJS is a general-purpose JavaScript mathematical graphics library. Topology articles are its first intended showcase. This experiment does not freeze a public rendering API or select a final backend.

Generated from results/cpu.json (2026-11-06T09:27:59.084Z) and results/native-software.json (2026-11-06T09:33:31.726Z).

Source hashes at report generation are in results/source-manifest.json. Raw samples, validation results and PNGs are retained alongside this report.

## Scope and environment

- CPU: Intel(R) Core(TM) i7-10510U CPU @ 1.80GHz; Node v26.1.0; V8 14.6.202.34-node.19.
- Rendering: SwiftShader driver 5.0.0; swiftshader; fallback adapter = true.
- No physical GPU device is exposed in the execution environment. Chromium startup is blocked by sandbox socket restrictions. Native Dawn + SwiftShader executes the shaders locally without a browser.
- **These are CPU and software-renderer observations, not hardware GPU results or browser frame rates.**
- Power mode, CPU frequency and competing host workloads were not controlled. Repeated shuffled rounds expose, but do not eliminate, noise.

## CPU-only update experiment

Five shuffled rounds per case. Each round has 60 warmup calls and 15 calibrated batches targeting 6 ms. Values below are the median of the five round medians; the range shows the slowest and fastest round medians. No allocations occur in the update loops.

| Grid | Method | Median ms/update | Round median range (ms) |
|---|---|---:|---:|
| 32 × 32 | cpu-naive | 0.0540 | 0.0435–0.0706 |
| 32 × 32 | cpu-rows | 0.0098 | 0.0086–0.0125 |
| 32 × 32 | cpu-basis | 0.0107 | 0.0082–0.0132 |
| 128 × 128 | cpu-naive | 0.8231 | 0.5213–1.2002 |
| 128 × 128 | cpu-rows | 0.1298 | 0.1001–0.1611 |
| 128 × 128 | cpu-basis | 0.1161 | 0.0857–0.1545 |
| 512 × 512 | cpu-naive | 11.9049 | 8.8634–16.8330 |
| 512 × 512 | cpu-rows | 2.2288 | 1.7237–2.4874 |
| 512 × 512 | cpu-basis | 1.6552 | 1.3812–3.0056 |
| 1024 × 1024 | cpu-naive | 48.5911 | 39.0612–62.7353 |
| 1024 × 1024 | cpu-rows | 8.4290 | 6.7210–8.9329 |
| 1024 × 1024 | cpu-basis | 7.4817 | 4.8174–14.4419 |

Naive evaluates sin for every vertex. Rows evaluates it once per grid row. Basis precomputes sin(3y) and cos(3y), evaluates sin/cos of phase once per update, and combines the row coefficients. This is a separable-map optimization, not a claim about arbitrary deformations.

## Native software rendering

Configuration: {"sizes":[32,128,256],"rounds":3,"batchFrames":12,"measuredBatches":5,"warmupFrames":24,"seed":991,"width":640,"height":480,"sampleCount":1,"primitive":"indexed line-list","indexType":"uint16 for <=65536 vertices, uint32 otherwise"}.

The table aggregates the round medians. CPU time covers update, upload API calls, encoding, and submit. Drained time is a batch wall time divided by submitted frames, with a queue-completion wait only at each batch boundary. GPU timestamps cover compute/render passes only; they exclude queue uploads, CPU time, and presentation. Timestamp resolution is implementation dependent. Do not add CPU and GPU values together: their timelines overlap.

| Grid | Strategy | CPU ms | Drained ms/frame | Render-pass ms | Compute-pass ms | Upload bytes/frame | GPU buffer bytes* |
|---|---|---:|---:|---:|---:|---:|---:|
| 32 | basis | 0.203 | 1.670 | 1.507 | 0.000 | 32 | 25120 |
| 32 | compute | 0.252 | 1.748 | 1.442 | 0.066 | 32 | 25120 |
| 32 | compute-basis | 0.289 | 1.975 | 1.638 | 0.066 | 32 | 33312 |
| 32 | cpu-basis | 0.253 | 1.551 | 1.376 | 0.000 | 8224 | 16928 |
| 32 | cpu-naive | 0.302 | 1.547 | 1.311 | 0.000 | 8224 | 16928 |
| 32 | cpu-rows | 0.274 | 1.795 | 1.442 | 0.000 | 8224 | 16928 |
| 32 | procedural | 0.214 | 1.845 | 1.638 | 0.000 | 32 | 8736 |
| 32 | row-table | 0.257 | 1.833 | 1.507 | 0.000 | 160 | 17056 |
| 32 | vertex | 0.207 | 1.908 | 1.573 | 0.000 | 32 | 16928 |
| 32 | vertex-bundle | 0.168 | 1.661 | 1.442 | 0.000 | 32 | 16928 |
| 128 | basis | 0.237 | 24.500 | 25.035 | 0.000 | 32 | 392992 |
| 128 | compute | 0.296 | 18.579 | 17.695 | 0.524 | 32 | 392992 |
| 128 | compute-basis | 0.307 | 22.149 | 22.217 | 0.721 | 32 | 524064 |
| 128 | cpu-basis | 0.475 | 19.308 | 19.071 | 0.000 | 131104 | 261920 |
| 128 | cpu-naive | 1.662 | 17.801 | 17.498 | 0.000 | 131104 | 261920 |
| 128 | cpu-rows | 0.506 | 21.084 | 21.037 | 0.000 | 131104 | 261920 |
| 128 | procedural | 0.227 | 19.097 | 18.809 | 0.000 | 32 | 130848 |
| 128 | row-table | 0.270 | 19.429 | 19.333 | 0.000 | 544 | 262432 |
| 128 | vertex | 0.253 | 21.572 | 21.496 | 0.000 | 32 | 261920 |
| 128 | vertex-bundle | 0.211 | 26.057 | 25.166 | 0.000 | 32 | 261920 |
| 256 | basis | 0.230 | 79.662 | 80.675 | 0.000 | 32 | 1571616 |
| 256 | compute | 0.300 | 86.471 | 81.199 | 2.425 | 32 | 1571616 |
| 256 | compute-basis | 0.299 | 90.133 | 80.937 | 2.621 | 32 | 2095904 |
| 256 | cpu-basis | 1.228 | 77.284 | 74.646 | 0.000 | 524320 | 1047328 |
| 256 | cpu-naive | 5.785 | 68.538 | 67.437 | 0.000 | 524320 | 1047328 |
| 256 | cpu-rows | 1.423 | 87.226 | 80.609 | 0.000 | 524320 | 1047328 |
| 256 | procedural | 0.234 | 86.976 | 82.051 | 0.000 | 32 | 523040 |
| 256 | row-table | 0.275 | 74.330 | 70.517 | 0.000 | 1056 | 1048352 |
| 256 | vertex | 0.212 | 71.748 | 67.764 | 0.000 | 32 | 1047328 |
| 256 | vertex-bundle | 0.204 | 78.060 | 74.777 | 0.000 | 32 | 1047328 |

*Explicitly allocated GPU buffers including timestamp resolve/readback buffers; excludes driver internals, pipelines, textures, and JavaScript model fixtures. It is not total process/GPU memory.

## Correctness gates

- 60 rendered cases checked across two grid sizes, zero/positive/negative amplitudes, and three phases.
- Every candidate image is compared against CPU-generated coordinates. Images must be nonempty; changed-pixel fraction must be <= 0.5% (RGB L1 difference > 12). This permits small rasterization shifts, not arbitrary visual equivalence.
- Compute buffers are read back and checked against an independent JavaScript analytic reference.
- Largest direct-sin compute coordinate error: 4.73320e-5.
- Largest precomputed-basis compute coordinate error: 7.06161e-8.
- Initial 2e-6 direct-sin tolerance failed. WGSL permits f32 sin absolute error up to 2^-11 over [-π,π]. The shader now reduces its angle into that interval and the test budget is amplitude × 2^-11 plus rounding margin (1.3e-4 at amplitude 0.25). The basis variant retains the tighter 2e-6 tolerance. Speed must be reported together with precision.
- Sample PNGs are saved in results/images. Lines use line-list rasterization without MSAA; production antialiased curves/text are not implemented or measured.

## Decisions supported now

1. Hoist shared mathematical work before considering a lower-level language. Row/basis methods avoid evaluating the same function for every vertex.
2. Preserve static geometry. The vertex/basis/procedural paths upload 32 bytes of parameters per frame. Full CPU position updates upload 8 × vertex count + 32 bytes. Row-table uploads 4 × row count + 32 bytes.
3. Keep compute as a candidate, not a default. It adds an intermediate output buffer and a pass. Test reuse across multiple draws before accepting that cost.
4. Use demand-driven scheduling for static diagrams. Scheduler tests verify coalesced invalidations and zero queued frames while paused or hidden.
5. Do not select a universal winner from SwiftShader. Browser/hardware results can reverse these rankings.

## Next experimental gates

- Run the existing browser harness on a physical integrated GPU and a discrete/mobile GPU; save adapter, browser, resolution and power conditions.
- Compare equal-quality native WebGL2 and WebGPU implementations before committing to one backend.
- Measure repeated geometry, draw-call batching, render bundles at high draw counts, and multiple article embeds; the current one-draw fixture cannot decide those questions.
- Benchmark antialiased curves, picking, text, pixel density and startup separately. Test workers/WASM only against measured CPU bottlenecks.
- Never promote a strategy on throughput alone: require numerical/visual checks and browser pacing, then measure interaction latency separately.

## Sources

- [WebGPU specification: timelines, timestamp queries, resource lifecycle](https://www.w3.org/TR/webgpu/)
- [WGSL specification: floating-point accuracy](https://www.w3.org/TR/WGSL/#floating-point-accuracy)
- [Chrome: developer features and timestamp quantization](https://developer.chrome.com/docs/web-platform/webgpu/developer-features)
- [wgpu: resource allocation, uploads and submission guidance](https://wgpu.rs/doc/wgpu/documentation/best_practices/dos_and_donts/index.html)
- [Dawn Node binding: native/offscreen support and limitations](https://github.com/dawn-gpu/node-webgpu)
- [MDN: OffscreenCanvas and worker rendering](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [shadcn: composable, editable source distribution](https://ui.shadcn.com/docs)
