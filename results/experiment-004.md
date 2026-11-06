# Pressure kernel indexing and tiling

The direct-index kernel replaces integer modulo in each Jacobi stencil with linear neighbor indices and explicit periodic boundary wrapping. It preserves the 40-iteration solve, timestep, field layout and output. The alternative tiled kernel performs two iterations per dispatch with a two-cell halo and shared workgroup memory.

[Full raw run](runs/2026-11-06T10-31-25-656Z-13-pressure-software/result.json), [telemetry](runs/2026-11-06T10-31-25-656Z-13-pressure-software/telemetry.json), and frozen source files are retained in the same run directory. Backend: native Dawn/SwiftShader software Vulkan. No browser or physical-GPU conclusion follows from these numbers.

| Grid | Workgroup | Original ms/step | Direct-index ms/step | Ratio |
|---|---|---:|---:|---:|
| 128² | 8×8 | 52.419 | 30.816 | 1.70× |
| 128² | 16×16 | 64.484 | 27.490 | 2.35× |
| 256² | 8×8 | 191.774 | 154.978 | 1.24× |
| 256² | 16×16 | 184.182 | 102.573 | 1.80× |

Times are medians of three round medians for the entire fluid step, including rendering. Each case has four batches of three measured steps after warmup: 24 cases and 288 timed steps. Case order alternates using a seeded shuffle; variability remains and no confidence interval or sustained thermal claim is made.

Sixty shader correctness cases cover small/odd grids, partial workgroups, periodic halos, odd iteration counts, buffer parity and eight evolving fluid steps. Maximum error against the float64 CPU projection reference is **7.153×10⁻⁷**. Across the 24 timing cases, the resulting direct-index and original fields match exactly in the observed float32 readbacks. All 84 completed checks pass, with zero uncaptured GPU validation errors.

The [tiled smoke run](runs/2026-11-06T10-29-36-242Z-13-pressure-software/result.json) also matched output, but took 252.636 ms/step versus 44.999 ms/step for the original kernel at 64² and 8×8. That is a software-renderer regression, not evidence against workgroup memory on physical GPUs. It remains available with `--include-tiled`; ordinary comparison runs focus on direct indexing. At the time of this software run, the default remained the original kernel. Subsequent [hardware and browser measurements](hardware-browser.md) support direct indexing as the new fluid default; the original remains available for comparisons.

The full run logged 126 resource samples over 63.5 seconds and peak sampled process RSS of 512,847,872 bytes. This includes native software-renderer allocations, not physical GPU VRAM. Compiler/cache accumulation and transient allocations are included in the process peak. Existing pressure residual and semi-Lagrangian mass-drift limitations remain; these optimizations change execution, not solver convergence.

```sh
npm run bench:pressure -- --software
npm run bench:pressure:browser -- --headed
npm run bench:pressure -- --software --quick --include-tiled
```

The self-contained library build excludes this stress workload. Its file size is unchanged.
