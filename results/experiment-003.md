# Fluid compute and rendering stress test

[Raw result](runs/2026-11-06T10-15-08-674Z-13-fluid-software/result.json) and [resource telemetry](runs/2026-11-06T10-15-08-674Z-13-fluid-software/telemetry.json) from native Dawn/SwiftShader on 6 November 2026. This is software execution, not physical-GPU or browser performance.

The run covers 128² and 256² cells, 40 Jacobi iterations, 8×8 and 16×16 workgroups, three rounds, five measured batches per case and four steps per batch: **240 measured steps**, plus warmup and validation. Each step has 43 compute dispatches and a fullscreen render pass. Initial conditions and simulated duration are identical between workgroup variants.

| Grid | Workgroup | Median of round medians, drained ms/step |
|---|---|---:|
| 128² | 8×8 | 102.782 |
| 128² | 16×16 | 93.627 |
| 256² | 8×8 | 241.843 |
| 256² | 16×16 | 341.695 |

Inter-round variability is substantial. These numbers do not establish a portable optimal workgroup size. GPU compute/render timestamps, CPU submission samples, setup times and explicit allocations are retained per case. Timed-batch averages must not be interpreted as individual-frame or interaction latency.

Validation and resources:

- Fourteen completed numerical checks passed; zero uncaptured WebGPU validation errors and zero observed nonfinite values.
- The manufactured pressure-projection case differs from an independent float64 CPU solve by at most **2.384×10⁻⁷**. Constant-field transport also passes.
- Dye-mass drift after 20 steps: **−0.86%** at 128² and **−2.00%** at 256². Semi-Lagrangian transport is not mass conserving.
- Final divergence RMS at 256² is **0.6951**, versus **0.7338** before the final projection. Forty Jacobi iterations do not fully converge this case. Passing here means agreement with the specified approximate method and bounded output, not a certified incompressible solution.
- 127 resource samples over approximately **63.9 seconds**; peak sampled Node RSS **279,117,824 bytes** (266.2 MiB). CPU time includes SwiftShader worker threads. GPU utilization and physical VRAM counters are unavailable and recorded as null.

The rendered [256² output](runs/2026-11-06T10-15-08-674Z-13-fluid-software/fluid-256-wg8.png) was inspected. It is a deterministic dye-transport stress fixture, not a free-surface water simulation or a visual-effects showcase.

Real-environment attempts are retained separately: [native hardware](runs/2026-11-06T10-14-56-080Z-13-fluid-hardware/result.json) found no physical adapter; [Chromium](runs/2026-11-06T10-14-58-239Z-13-fluid-chromium/result.json) was blocked at startup; [Firefox](runs/2026-11-06T10-14-59-048Z-13-fluid-firefox/result.json) lacked its automation build after a DNS-blocked download. None is a performance or compatibility pass.

Next meaningful optimization: compare pressure solvers at the same divergence-residual target, including multigrid or a periodic FFT method. Then test fused passes and storage layout. A learned pressure initial guess is a separate research candidate with a numerical correction step; no neural speedup has been measured.
