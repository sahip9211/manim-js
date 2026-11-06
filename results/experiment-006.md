# 3D Taylor–Green vortex: harder stress test

ManimJS now has a repeatable 3D flow and volume-rendering benchmark in `experiments/vortex/`. The largest case evolves **2,097,152 cells**, eight times the cell count of the previous 512² fluid workload, with larger stencils and a volume raymarch. It caught an interpolation defect that the earlier small projection checks missed.

The new FFT pressure implementation evaluates the same mathematical 80 Jacobi iterations as the vectorized baseline. Across four hardware/runtime comparisons, median GPU simulation speedups were **1.67–3.04×**; simulation plus rendering improved **1.57–2.84×**. **The 10× target has not been achieved.** These are short, instrumented active-desktop measurements, not an FPS guarantee or a universal optimum.

## Why this problem

The [High-Order CFD Workshop Taylor–Green benchmark](https://how4.cenaero.be/content/bs1-dns-taylor-green-vortex-re1600) tests a triply periodic 3D flow that develops small scales, with energy dissipation and enstrophy among its diagnostics. It specifies mesh resolutions including 64³ and 128³. Those properties make it useful for stressing memory access, numerical kernels and rendering together.

This implementation borrows the initial velocity field and nondimensional Reynolds number 1600. It is a **low-order incompressible graphics stress fixture**, not the workshop's validated DNS solution. Semi-Lagrangian numerical diffusion, incomplete pressure convergence and limited resolution matter. The stability test reaches nondimensional time 2; it does not validate the full transition through time 20, energy spectra or grid convergence. Cell-centered initial velocities also have nonzero divergence under the backward-difference operator, which is measured rather than assumed away.

## Work and measurement protocol

- 64³ and 128³ cells; periodic boundaries; velocity XYZ plus passive dye in float32.
- Eight-neighbor trilinear backtracing, six-neighbor explicit viscosity, compatible backward divergence and forward pressure gradient. Timestep 0.02, viscosity 1/1600.
- Baseline: four adjacent pressure cells per invocation, minimal bindings, read-only divergence, and first Jacobi iteration fused into divergence. Both methods specialize the common shaders to the same grid size.
- Candidate: three forward and three inverse row FFTs, four tiled axis permutations, precomputed twiddles and a spectral filter. Ten pressure dispatches replace the baseline's remaining 79; overall simulation dispatches fall from 82 to 13.
- Identical 256×256 oblique volume rendering, 128 samples per ray, nearest-cell density lookup, front-to-back integration without early ray termination. Up to 8,388,608 ray positions per rendered frame; positions outside the cube skip field lookup.
- Three shuffled rounds, two warmup steps per case, then four batches of two evolving steps. Twelve timed cases and 96 timed steps per runtime. GPU timestamps sample the final step of each batch; CPU submission and submit-to-completion batch timing are retained separately. Setup, validation and readbacks are outside timed batches.
- An additional 100-step 64³ FFT stability run records energy, enstrophy, divergence, speed and dye bounds every 20 steps.

For a periodic d-dimensional stencil, the Jacobi eigenvalue is `mu = sum(cos(2*pi*k_i/n))/d`. Starting from zero pressure, the finite-iteration filter is `(1-mu^K)/(2*d*(mu-1))`, with limit `-K/(2*d)` at `mu=1`. This is a finite geometric series, not substitution of a fully converged Poisson solution. Float32 rounding differs. Fourier diagonalization of periodic difference operators is described in [MIT's numerical methods notes](https://math.mit.edu/icg/resources/teaching/18.336-spring2013/Notes_Set2.pdf).

## Measurements

Each time below is the median of twelve final-step GPU samples. Ratios compare methods within the same run. Common stages and rendering are unchanged between methods. The total-GPU column includes both simulation and raymarching; its median is computed from per-sample sums.

| Runtime | Grid | Jacobi simulation ms | FFT simulation ms | Simulation speedup | Simulation + render speedup |
|---|---:|---:|---:|---:|---:|
| Native Intel | 64³ | 23.200 | 11.928 | 1.95× | 1.85× |
| Native Intel | 128³ | 234.684 | 123.732 | 1.90× | 1.87× |
| Chromium 155, Intel | 64³ | 14.410 | 7.352 | 1.96× | 1.86× |
| Chromium 155, Intel | 128³ | 239.869 | 94.208 | 2.55× | 2.50× |
| Firefox 158, Intel | 64³ | 13.749 | 8.237 | 1.67× | 1.57× |
| Firefox 158, Intel | 128³ | 244.551 | 127.525 | 1.92× | 1.87× |
| Native NVIDIA MX250 | 64³ | 6.881 | 2.359 | 2.92× | 2.50× |
| Native NVIDIA MX250 | 128³ | 59.441 | 19.530 | 3.04× | 2.84× |

The desktop was active, without fixed clocks or thermal controls. The NVIDIA 64³ FFT samples include a 17.891 ms p95 versus a 2.359 ms median; the result is noisy, not a claim of steady frame pacing. All samples, including slow ones, remain in the raw files.

Both browser windows were verified on **workspace 5**, while the active workspace was 1 at inspection; the runner never requests a workspace switch. Chromium reported visible, Firefox hidden. Experimental WebGPU was explicitly enabled in isolated profiles. Default-profile WebGPU availability is not implied. At 64³, Firefox's median completion time was about 50 ms per step for either solver despite their different GPU times. Background scheduling limits that measurement; it is not display or input-to-photon latency.

## Correctness and the defect this caught

Each full run passed 19 CPU/analytic checks, 12 timed-state checks and the 100-step stability check, with zero reported uncaptured GPU errors. Independent float64 CPU checks cover random modes, checkerboard modes, both kernels, odd/even iteration counts, advection with viscosity, and two evolving steps. The analytic initial mean kinetic energy is 0.125.

The fixed acceptance limits were 2×10⁻⁵ maximum absolute field error in units with initial velocity scale U=1, 2×10⁻⁵ relative L2, and at most one 8-bit channel value of image difference. The largest evolved-field difference in the final comparisons was **4.396×10⁻⁷**. Render bytes matched exactly except the NVIDIA 128³ pair, whose maximum channel difference was 1. No final nonfinite values or dye-bound violations were observed. Final pressure projection reduced divergence relative to the advected field.

The first 32³ evolving test failed with a 0.096966 field difference after four steps, despite tiny one-step projection errors. Computing interpolation weights with a separate `fract(position)` could disagree near integer boundaries with the integer cell selected by `floor(position)` on the tested Intel path. Deriving weights from that exact cell index (`position - float(cell)`, clamped to [0,1]) reduced the four-step difference to 2.682×10⁻⁷. The precise compiler lowering was not established. A two-step CPU reference case now guards this boundary behavior. The [failed run and frozen shader](runs/2026-11-06T11-56-54-132Z-312403-vortex-native/result.json) are retained.

The earlier [2D spectral attempt](runs/2026-11-06T11-47-23-002Z-299931-spectral-hardware/result.json) also remains failed: its 512² evolved field exceeded that experiment's absolute error limit (3.052×10⁻⁵ versus 2×10⁻⁵). It is not counted as passing performance evidence. The generalized FFT subsequently passed all twenty 2D CPU checks plus the small paired evolution check in [the regression run](runs/2026-11-06T12-03-53-683Z-322171-spectral-hardware/result.json); that smoke run was concurrent with CPU unit/build checks and is not used for performance claims.

## Memory and telemetry

At 128³, baseline GPU buffers total **88.00 MiB**, versus **128.00 MiB** for FFT, plus a 0.25 MiB output texture for each. The extra 40 MiB stores complex scratch volumes and filter coefficients. These counts exclude driver memory, host copies and temporary validation readbacks.

| Whole run | Duration s | Peak summed tree RSS MiB | Runner CPU seconds | Peak sampled tree CPU, % of one core |
|---|---:|---:|---:|---:|
| Native Intel | 49.94 | 336.5 | 49.68 | 185.8 |
| Chromium | 42.24 | 1542.5 | 9.97 | 417.8 |
| Firefox | 69.26 | 1822.1 | 6.12 | 272.1 |
| Native NVIDIA | 81.77 | 476.1 | 68.83 | 222.8 |

These are whole-run values including validation, compilation and telemetry, not per-frame costs. Summed RSS may double-count shared pages. Runner CPU seconds exclude browser-process CPU; sampled tree percentages include descendants. Native Intel's sampled client render-engine peak was 86.3%; NVIDIA's device-wide peak was 60% with 156 MiB VRAM used. Those counters have different scopes and are not comparable GPU occupancy measurements. NVIDIA counters during Intel runs do not describe Intel utilization. Raw logs retain CPU/RAM, runner heap, DRM client engines/memory, available device-wide GPU utilization/VRAM, sampler overhead, latency samples and errors; absent counters stay null.

## Evidence and reproduction

- Native Intel: [result](runs/2026-11-06T11-58-46-167Z-314862-vortex-native/result.json), [telemetry](runs/2026-11-06T11-58-46-167Z-314862-vortex-native/telemetry.json), [render](runs/2026-11-06T11-58-46-167Z-314862-vortex-native/preview.png).
- Chromium: [result](runs/2026-11-06T11-59-58-858Z-316621-vortex-chromium/result.json), [telemetry](runs/2026-11-06T11-59-58-858Z-316621-vortex-chromium/telemetry.json), [render](runs/2026-11-06T11-59-58-858Z-316621-vortex-chromium/preview.png).
- Firefox: [result](runs/2026-11-06T12-00-41-111Z-316621-vortex-firefox/result.json), [telemetry](runs/2026-11-06T12-00-41-111Z-316621-vortex-firefox/telemetry.json), [render](runs/2026-11-06T12-00-41-111Z-316621-vortex-firefox/preview.png).
- NVIDIA: [result](runs/2026-11-06T12-02-24-850Z-320570-vortex-native/result.json), [telemetry](runs/2026-11-06T12-02-24-850Z-320570-vortex-native/telemetry.json), [render](runs/2026-11-06T12-02-24-850Z-320570-vortex-native/preview.png).

Each run contains frozen source files and SHA-256 hashes. [The aggregate JSON](vortex-summary.json) includes separate simulation/render/completion statistics and resource summaries. `scripts/reports/vortex.mjs` regenerates it from the latest successful full run for each runtime/adapter and exports PNGs from retained raw pixels. Historical failures are preserved rather than pooled into successful medians.

```sh
npm run bench:vortex
npm run bench:vortex -- --quick
npm run bench:vortex:browser
MANIM_JS_ADAPTER='NVIDIA GeForce MX250' npm run bench:vortex
node scripts/reports/vortex.mjs
npm run report:runs
```

All 13 existing unit tests and the build pass. The self-contained classic library remains **11,580 bytes / 4,902 gzip**, with zero external imports; the stress workload is outside its distribution. The 2D default remains the validated vectorized Jacobi path. This experiment supplies a harder benchmark and an optional FFT candidate, not a premature public simulation API.

Next performance questions are the 3D FFT's shared-memory access, axis-permutation traffic and common advection kernels. Future changes must keep this evolving-field/image validation and expose memory tradeoffs. Raising an iteration count merely to inflate the speedup would not establish a 10× gain for the present workload.
