# Experiment 008: optimization against a frozen FFT baseline

The baseline is the previously optimized real-input radix-8 FFT with inline divergence, frozen in `experiments/baselines/vortex-008.js`. The target is a further 10× reduction in median GPU simulation-plus-render time at identical workload and error limits. **That target has not been reached.**

## Conditional translation symmetry

The Taylor–Green fixture repeats under translations `(N/2, N/2, 0)` and `(N/2, 0, N/2)`. A candidate stores one quarter of the cells, retaining the full logical domain through twisted periodic indexing. Crossing a shortened y or z boundary shifts x by half a period. The FFT phases and spectral filter use the corresponding physical frequencies. Asymmetric inputs are explicitly rejected.

The method changes representation, not the logical grid, timestep, iteration count, ray count, or field-error threshold. It is conditional on this symmetry and cannot be treated as a generic dense-fluid speedup. The symmetry structure is consistent with the [Taylor–Green analysis by Brachet et al.](https://www.lps.ens.fr/~brachet/files/Publications_%26_Reprints_files/TG_MIT.pdf); this implementation uses only the four-member translation subgroup.

## Paired browser results

Both runs use experimental WebGPU, isolated browser profiles, and background workspace 5. Each case has twelve final-step GPU samples across three shuffled rounds. The 128³ workload evolves 2,097,152 logical cells and renders 256×256 pixels with 128 samples per ray.

| Browser | Grid | GPU simulation + render speedup | Baseline / candidate GPU buffers MiB | Maximum timed field difference |
| --- | --- | --- | --- | --- |
| Chromium | 64³ | 2.78× | 12.13 / 3.03 | 7.898e-7 |
| Firefox | 64³ | 1.94× | 12.13 / 3.03 | 7.898e-7 |
| Chromium | 128³ | 3.69× | 94.50 / 23.63 | 7.823e-7 |
| Firefox | 128³ | 4.55× | 94.50 / 23.63 | 7.823e-7 |

These are ratios of within-run median combined GPU times, not ratios of separately rounded compute/render medians. Both full browser runs passed reference, timed-state, image, and 100-step stability checks with zero recorded GPU errors. Field acceptance remains 2e-5 absolute and relative L2 error; image channels differ by at most one 8-bit value. Whole-run peak process-tree RSS was approximately 1575 MiB for Chromium and 1763 MiB for Firefox, including validation and automation.

[The complete log](rebased-log.md) includes raw run links, simulation p95, completion timing, CPU, memory, sample counts, and unsuccessful candidates. GPU memory excludes driver allocations; process-tree RSS may double-count shared pages. Firefox queue-completion delays prevent interpreting GPU execution improvements as equivalent wall-clock or presentation improvements.

## Other candidates

Explicit butterfly unrolling and fused inverse-transform/projection passed smaller equivalence checks but were slower in the native screening run. They remain explicit comparison modes, not selected defaults. Series 007 also records real-input transforms, shared-memory layouts, advection tiling, shader specialization, and JavaScript initialization experiments. Startup-only gains are reported separately from simulation gains.

## Reproduce

```sh
npm run bench:rebased:browser -- --candidates=fft-real8-symmetry
npm run report:rebased
```

The runner verifies the frozen baseline hash before execution. Each new comparison reruns that baseline alongside the candidate. Historical target times are illustrative; they are not substitutes for a paired run on the same device.
