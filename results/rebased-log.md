# Rebased optimization experiment log

Generated 2026-11-06T13:20:10.521Z. Raw data, telemetry and frozen SHA-256 source snapshots accompany each attempt.

All speedups in this log use frozen-008, the already optimized FFT baseline. The target is a further 10× in simulation plus rendering. Conditional symmetry modes report logical and stored cells separately; they are not general dense-field speedups.

## Attempts and resources

| Attempt | Runtime / adapter | Status | Duration s | Peak tree RSS MiB | Runner CPU s | GPU errors |
|---|---|---|---:|---:|---:|---:|
| [2026-11-06T12-53-12-424Z-395921-rebased-native](runs/2026-11-06T12-53-12-424Z-395921-rebased-native/result.json) | native intel | complete | 26.0 | 447.6 | 32.3 | 0 |
| [2026-11-06T13-01-35-886Z-409024-rebased-native](runs/2026-11-06T13-01-35-886Z-409024-rebased-native/result.json) | native intel | complete | 18.1 | 400.5 | 26.2 | 0 |
| [2026-11-06T13-03-19-476Z-411300-rebased-chromium](runs/2026-11-06T13-03-19-476Z-411300-rebased-chromium/result.json) | chromium intel | complete | 44.1 | 1575.4 | 7.1 | 0 |
| [2026-11-06T13-04-03-583Z-411300-rebased-firefox](runs/2026-11-06T13-04-03-583Z-411300-rebased-firefox/result.json) | firefox  | complete | 81.0 | 1763.3 | 7.4 | 0 |
| [2026-11-06T13-19-23-036Z-436082-rebased-native](runs/2026-11-06T13-19-23-036Z-436082-rebased-native/result.json) | native intel | complete | 13.2 | 349.9 | 17.6 | 0 |

Whole-run resource values include setup, CPU references, validation, readbacks and sampling overhead. Runner CPU excludes browser-process CPU; per-sample tree CPU, DRM counters and device-wide GPU counters are in each telemetry.json. Missing counters are not zero. Node GC entries describe the runner only; portable page APIs do not expose browser GC events.

## Full paired GPU comparisons

Twelve final-step GPU samples per case across three shuffled rounds. Ratios are within a run. Numerical acceptance remains 2e-5 absolute/relative field error and at most one 8-bit render-channel value.

| Run | Grid | Kernel | Simulation median / p95 ms | Render median ms | GPU total speedup | Completion median ms | GPU buffers MiB | Logical / stored cells | Max field error |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| [2026-11-06T13-03-19-476Z-411300-rebased-chromium](runs/2026-11-06T13-03-19-476Z-411300-rebased-chromium/result.json) | 64³ | fft-real8-symmetry | 0.646 / 3.356 | 1.859 | 2.78× | 5.170 | 3.03 | 262144 / 65536 | 7.898e-7 |
| [2026-11-06T13-03-19-476Z-411300-rebased-chromium](runs/2026-11-06T13-03-19-476Z-411300-rebased-chromium/result.json) | 64³ | frozen-008 | 5.170 / 7.309 | 1.720 | 1.00× | 11.377 | 12.13 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T13-03-19-476Z-411300-rebased-chromium](runs/2026-11-06T13-03-19-476Z-411300-rebased-chromium/result.json) | 128³ | fft-real8-symmetry | 9.771 / 16.806 | 3.383 | 3.69× | 17.848 | 23.63 | 2097152 / 524288 | 7.823e-7 |
| [2026-11-06T13-03-19-476Z-411300-rebased-chromium](runs/2026-11-06T13-03-19-476Z-411300-rebased-chromium/result.json) | 128³ | frozen-008 | 44.526 / 70.715 | 4.488 | 1.00× | 57.265 | 94.50 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T13-04-03-583Z-411300-rebased-firefox](runs/2026-11-06T13-04-03-583Z-411300-rebased-firefox/result.json) | 64³ | fft-real8-symmetry | 0.579 / 2.211 | 1.852 | 1.94× | 50.030 | 3.03 | 262144 / 65536 | 7.898e-7 |
| [2026-11-06T13-04-03-583Z-411300-rebased-firefox](runs/2026-11-06T13-04-03-583Z-411300-rebased-firefox/result.json) | 64³ | frozen-008 | 3.202 / 6.607 | 1.544 | 1.00× | 50.000 | 12.13 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T13-04-03-583Z-411300-rebased-firefox](runs/2026-11-06T13-04-03-583Z-411300-rebased-firefox/result.json) | 128³ | fft-real8-symmetry | 7.622 / 11.217 | 3.422 | 4.55× | 49.990 | 23.63 | 2097152 / 524288 | 7.823e-7 |
| [2026-11-06T13-04-03-583Z-411300-rebased-firefox](runs/2026-11-06T13-04-03-583Z-411300-rebased-firefox/result.json) | 128³ | frozen-008 | 45.491 / 54.240 | 4.763 | 1.00× | 92.730 | 94.50 | 2097152 / 2097152 | 0.000e+0 |

## JavaScript initialization

These are initialization-only measurements, including output allocation and any GC pauses. The output is bitwise checked against the frozen scalar implementation. Fifteen samples per method/size, five shuffled rounds; no forced GC or discarded slow samples.

| Run | Grid | Method | Median / p95 ms | Initialization speedup |
|---|---:|---|---:|---:|

[Machine-readable comparison](rebased-log.json). Regenerate with node scripts/reports/optimization.mjs --rebased.
