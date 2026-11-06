# Optimization experiment log

Generated 2026-11-06T13:18:44.348Z. Raw data, telemetry and frozen SHA-256 source snapshots accompany each attempt.

The 10× target refers to the same evolving workload, not a larger iteration count, lower resolution or a startup-only gain. Separate columns distinguish GPU simulation, rendering and submit-to-completion timing. Offscreen browser results are not display latency. Failed attempts remain visible.

## Attempts and resources

| Attempt | Runtime / adapter | Status | Duration s | Peak tree RSS MiB | Runner CPU s | GPU errors |
|---|---|---|---:|---:|---:|---:|
| [2026-11-06T12-09-03-861Z-328324-vortex-profile](runs/2026-11-06T12-09-03-861Z-328324-vortex-profile/result.json) | Node + Dawn (not browser) intel | complete | 8.0 | 372.0 | 9.3 | 0 |
| [2026-11-06T12-11-35-747Z-331671-vortex-native](runs/2026-11-06T12-11-35-747Z-331671-vortex-native/result.json) | native intel | complete | 9.0 | 290.7 | 13.9 | 0 |
| [2026-11-06T12-12-40-703Z-333079-vortex-native](runs/2026-11-06T12-12-40-703Z-333079-vortex-native/result.json) | native intel | complete | 59.3 | 432.9 | 64.8 | 0 |
| [2026-11-06T12-14-53-813Z-336030-js-init-chromium](runs/2026-11-06T12-14-53-813Z-336030-js-init-chromium/result.json) | chromium  | complete | 24.6 | 1349.0 | 5.7 | 0 |
| [2026-11-06T12-15-18-420Z-336030-js-init-firefox](runs/2026-11-06T12-15-18-420Z-336030-js-init-firefox/result.json) | firefox  | complete | 24.5 | 1559.4 | 2.6 | 0 |
| [2026-11-06T12-17-21-016Z-339744-vortex-native](runs/2026-11-06T12-17-21-016Z-339744-vortex-native/result.json) | native intel | complete | 59.9 | 397.0 | 67.6 | 0 |
| [2026-11-06T12-19-31-951Z-342629-vortex-native](runs/2026-11-06T12-19-31-951Z-342629-vortex-native/result.json) | native intel | complete | 10.7 | 271.6 | 16.2 | 0 |
| [2026-11-06T12-20-59-138Z-345748-vortex-native](runs/2026-11-06T12-20-59-138Z-345748-vortex-native/result.json) | native intel | failed | 1.5 | 156.2 | 1.8 | 6 |
| [2026-11-06T12-21-43-083Z-346814-vortex-native](runs/2026-11-06T12-21-43-083Z-346814-vortex-native/result.json) | native intel | complete | 19.8 | 255.4 | 16.6 | 0 |
| [2026-11-06T12-22-56-128Z-348217-js-init-chromium](runs/2026-11-06T12-22-56-128Z-348217-js-init-chromium/result.json) | chromium  | complete | 33.1 | 1406.6 | 6.5 | 0 |
| [2026-11-06T12-23-29-191Z-348217-js-init-firefox](runs/2026-11-06T12-23-29-191Z-348217-js-init-firefox/result.json) | firefox  | complete | 25.6 | 1584.8 | 2.3 | 0 |
| [2026-11-06T12-24-54-093Z-351801-vortex-native](runs/2026-11-06T12-24-54-093Z-351801-vortex-native/result.json) | native intel | failed | 9.8 | 235.4 | 14.0 | 1 |
| [2026-11-06T12-25-24-615Z-352493-vortex-native](runs/2026-11-06T12-25-24-615Z-352493-vortex-native/result.json) | native intel | complete | 67.0 | 422.5 | 71.1 | 0 |
| [2026-11-06T12-27-12-855Z-355209-vortex-native](runs/2026-11-06T12-27-12-855Z-355209-vortex-native/result.json) | native intel | complete | 81.9 | 423.2 | 68.3 | 0 |
| [2026-11-06T12-29-55-906Z-360271-vortex-native](runs/2026-11-06T12-29-55-906Z-360271-vortex-native/result.json) | native intel | complete | 78.3 | 396.8 | 81.7 | 0 |
| [2026-11-06T12-35-35-052Z-368543-vortex-native](runs/2026-11-06T12-35-35-052Z-368543-vortex-native/result.json) | native intel | complete | 14.5 | 271.6 | 18.6 | 0 |
| [2026-11-06T12-36-23-010Z-369797-vortex-chromium](runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/result.json) | chromium intel | complete | 91.5 | 1595.8 | 13.1 | 0 |
| [2026-11-06T12-37-54-531Z-369797-vortex-firefox](runs/2026-11-06T12-37-54-531Z-369797-vortex-firefox/result.json) | firefox  | complete | 167.7 | 2039.3 | 19.0 | 0 |
| [2026-11-06T12-41-46-152Z-376860-vortex-native](runs/2026-11-06T12-41-46-152Z-376860-vortex-native/result.json) | native nvidia | complete | 87.1 | 478.5 | 90.8 | 0 |
| [2026-11-06T12-47-31-163Z-384287-vortex-native](runs/2026-11-06T12-47-31-163Z-384287-vortex-native/result.json) | native intel | complete | 13.0 | 256.1 | 17.2 | 0 |

Whole-run resource values include setup, CPU references, validation, readbacks and sampling overhead. Runner CPU excludes browser-process CPU; per-sample tree CPU, DRM counters and device-wide GPU counters are in each telemetry.json. Missing counters are not zero. Node GC entries describe the runner only; portable page APIs do not expose browser GC events.

## Full paired GPU comparisons

Twelve final-step GPU samples per case across three shuffled rounds. Ratios are within a run. Numerical acceptance remains 2e-5 absolute/relative field error and at most one 8-bit render-channel value.

| Run | Grid | Kernel | Simulation median / p95 ms | Render median ms | GPU total speedup | Completion median ms | GPU buffers MiB | Logical / stored cells | Max field error |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| [2026-11-06T12-12-40-703Z-333079-vortex-native](runs/2026-11-06T12-12-40-703Z-333079-vortex-native/result.json) | 64³ | packed4 | 27.263 / 31.064 | 2.228 | 1.00× | 31.528 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-12-40-703Z-333079-vortex-native](runs/2026-11-06T12-12-40-703Z-333079-vortex-native/result.json) | 64³ | fft-jacobi | 17.302 / 23.527 | 2.228 | 1.50× | 19.814 | 16.00 | 262144 / 262144 | 3.092e-7 |
| [2026-11-06T12-12-40-703Z-333079-vortex-native](runs/2026-11-06T12-12-40-703Z-333079-vortex-native/result.json) | 64³ | fft-stockham | 6.423 / 11.796 | 2.163 | 3.40× | 12.560 | 16.00 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-12-40-703Z-333079-vortex-native](runs/2026-11-06T12-12-40-703Z-333079-vortex-native/result.json) | 128³ | packed4 | 255.984 / 295.371 | 5.374 | 1.00× | 269.013 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-12-40-703Z-333079-vortex-native](runs/2026-11-06T12-12-40-703Z-333079-vortex-native/result.json) | 128³ | fft-stockham | 61.014 / 73.662 | 6.029 | 3.90× | 67.698 | 128.00 | 2097152 / 2097152 | 4.321e-7 |
| [2026-11-06T12-12-40-703Z-333079-vortex-native](runs/2026-11-06T12-12-40-703Z-333079-vortex-native/result.json) | 128³ | fft-jacobi | 125.239 / 153.092 | 4.784 | 2.01× | 141.311 | 128.00 | 2097152 / 2097152 | 4.396e-7 |
| [2026-11-06T12-17-21-016Z-339744-vortex-native](runs/2026-11-06T12-17-21-016Z-339744-vortex-native/result.json) | 64³ | packed4 | 20.840 / 29.884 | 2.097 | 1.00× | 26.750 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-17-21-016Z-339744-vortex-native](runs/2026-11-06T12-17-21-016Z-339744-vortex-native/result.json) | 64³ | fft-stockham | 7.209 / 12.911 | 2.163 | 2.45× | 12.494 | 16.00 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-17-21-016Z-339744-vortex-native](runs/2026-11-06T12-17-21-016Z-339744-vortex-native/result.json) | 64³ | fft-stockham-static | 7.078 / 11.600 | 2.228 | 2.46× | 13.464 | 16.00 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-17-21-016Z-339744-vortex-native](runs/2026-11-06T12-17-21-016Z-339744-vortex-native/result.json) | 128³ | packed4 | 243.532 / 284.623 | 5.243 | 1.00× | 253.637 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-17-21-016Z-339744-vortex-native](runs/2026-11-06T12-17-21-016Z-339744-vortex-native/result.json) | 128³ | fft-stockham-static | 71.041 / 78.840 | 5.112 | 3.25× | 75.307 | 128.00 | 2097152 / 2097152 | 4.321e-7 |
| [2026-11-06T12-17-21-016Z-339744-vortex-native](runs/2026-11-06T12-17-21-016Z-339744-vortex-native/result.json) | 128³ | fft-stockham | 61.211 / 79.299 | 5.636 | 3.69× | 73.551 | 128.00 | 2097152 / 2097152 | 4.321e-7 |
| [2026-11-06T12-25-24-615Z-352493-vortex-native](runs/2026-11-06T12-25-24-615Z-352493-vortex-native/result.json) | 64³ | packed4 | 20.382 / 27.066 | 2.097 | 1.00× | 26.343 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-25-24-615Z-352493-vortex-native](runs/2026-11-06T12-25-24-615Z-352493-vortex-native/result.json) | 64³ | fft-real8 | 3.867 / 8.454 | 1.769 | 4.04× | 8.202 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-25-24-615Z-352493-vortex-native](runs/2026-11-06T12-25-24-615Z-352493-vortex-native/result.json) | 64³ | fft-real8-fused | 3.211 / 9.568 | 1.769 | 4.51× | 8.841 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-25-24-615Z-352493-vortex-native](runs/2026-11-06T12-25-24-615Z-352493-vortex-native/result.json) | 128³ | packed4 | 235.733 / 266.076 | 5.833 | 1.00× | 252.636 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-25-24-615Z-352493-vortex-native](runs/2026-11-06T12-25-24-615Z-352493-vortex-native/result.json) | 128³ | fft-real8-fused | 38.732 / 46.531 | 5.702 | 5.47× | 50.300 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-25-24-615Z-352493-vortex-native](runs/2026-11-06T12-25-24-615Z-352493-vortex-native/result.json) | 128³ | fft-real8 | 39.846 / 55.116 | 5.571 | 5.28× | 54.496 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-27-12-855Z-355209-vortex-native](runs/2026-11-06T12-27-12-855Z-355209-vortex-native/result.json) | 64³ | packed4 | 17.302 / 18.285 | 1.835 | 1.00× | 21.372 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-27-12-855Z-355209-vortex-native](runs/2026-11-06T12-27-12-855Z-355209-vortex-native/result.json) | 64³ | fft-real8 | 2.753 / 3.867 | 1.311 | 4.79× | 6.335 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-27-12-855Z-355209-vortex-native](runs/2026-11-06T12-27-12-855Z-355209-vortex-native/result.json) | 64³ | fft-real8-tiled | 2.818 / 8.323 | 1.311 | 4.63× | 5.828 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-27-12-855Z-355209-vortex-native](runs/2026-11-06T12-27-12-855Z-355209-vortex-native/result.json) | 128³ | packed4 | 222.626 / 231.670 | 5.374 | 1.00× | 230.578 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-27-12-855Z-355209-vortex-native](runs/2026-11-06T12-27-12-855Z-355209-vortex-native/result.json) | 128³ | fft-real8-tiled | 38.535 / 50.725 | 5.439 | 5.17× | 55.482 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-27-12-855Z-355209-vortex-native](runs/2026-11-06T12-27-12-855Z-355209-vortex-native/result.json) | 128³ | fft-real8 | 30.147 / 40.042 | 5.112 | 6.40× | 44.131 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-29-55-906Z-360271-vortex-native](runs/2026-11-06T12-29-55-906Z-360271-vortex-native/result.json) | 64³ | packed4 | 22.479 / 29.426 | 2.097 | 1.00× | 29.874 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-29-55-906Z-360271-vortex-native](runs/2026-11-06T12-29-55-906Z-360271-vortex-native/result.json) | 64³ | fft-real8 | 6.029 / 10.289 | 1.704 | 3.28× | 8.660 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-29-55-906Z-360271-vortex-native](runs/2026-11-06T12-29-55-906Z-360271-vortex-native/result.json) | 64³ | fft-real8-swizzle | 3.277 / 5.374 | 1.442 | 5.27× | 7.150 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-29-55-906Z-360271-vortex-native](runs/2026-11-06T12-29-55-906Z-360271-vortex-native/result.json) | 128³ | packed4 | 243.859 / 272.302 | 6.160 | 1.00× | 252.395 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-29-55-906Z-360271-vortex-native](runs/2026-11-06T12-29-55-906Z-360271-vortex-native/result.json) | 128³ | fft-real8-swizzle | 44.040 / 57.278 | 6.095 | 4.98× | 53.565 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-29-55-906Z-360271-vortex-native](runs/2026-11-06T12-29-55-906Z-360271-vortex-native/result.json) | 128³ | fft-real8 | 46.203 / 73.204 | 6.160 | 4.81× | 70.715 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-36-23-010Z-369797-vortex-chromium](runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/result.json) | 64³ | packed4 | 15.860 / 29.588 | 1.723 | 1.00× | 27.917 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-36-23-010Z-369797-vortex-chromium](runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/result.json) | 64³ | fft-real8 | 3.646 / 5.465 | 1.289 | 3.58× | 14.350 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-36-23-010Z-369797-vortex-chromium](runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/result.json) | 64³ | fft-real8-inline | 3.830 / 6.646 | 1.318 | 3.28× | 9.817 | 12.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-36-23-010Z-369797-vortex-chromium](runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/result.json) | 128³ | packed4 | 224.231 / 246.182 | 5.198 | 1.00× | 240.933 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-36-23-010Z-369797-vortex-chromium](runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/result.json) | 128³ | fft-real8-inline | 33.200 / 42.706 | 5.445 | 5.86× | 57.605 | 94.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-36-23-010Z-369797-vortex-chromium](runs/2026-11-06T12-36-23-010Z-369797-vortex-chromium/result.json) | 128³ | fft-real8 | 39.024 / 49.698 | 5.273 | 5.22× | 52.268 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-37-54-531Z-369797-vortex-firefox](runs/2026-11-06T12-37-54-531Z-369797-vortex-firefox/result.json) | 64³ | packed4 | 13.996 / 16.283 | 1.531 | 1.00× | 50.210 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-37-54-531Z-369797-vortex-firefox](runs/2026-11-06T12-37-54-531Z-369797-vortex-firefox/result.json) | 64³ | fft-real8 | 2.875 / 4.561 | 1.480 | 3.53× | 50.660 | 14.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-37-54-531Z-369797-vortex-firefox](runs/2026-11-06T12-37-54-531Z-369797-vortex-firefox/result.json) | 64³ | fft-real8-inline | 3.568 / 5.697 | 1.485 | 3.07× | 49.490 | 12.13 | 262144 / 262144 | 2.980e-7 |
| [2026-11-06T12-37-54-531Z-369797-vortex-firefox](runs/2026-11-06T12-37-54-531Z-369797-vortex-firefox/result.json) | 128³ | packed4 | 208.818 / 244.939 | 5.255 | 1.00× | 258.160 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-37-54-531Z-369797-vortex-firefox](runs/2026-11-06T12-37-54-531Z-369797-vortex-firefox/result.json) | 128³ | fft-real8-inline | 27.844 / 32.778 | 4.447 | 6.66× | 51.460 | 94.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-37-54-531Z-369797-vortex-firefox](runs/2026-11-06T12-37-54-531Z-369797-vortex-firefox/result.json) | 128³ | fft-real8 | 33.184 / 39.542 | 4.135 | 5.81× | 51.280 | 110.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-41-46-152Z-376860-vortex-native](runs/2026-11-06T12-41-46-152Z-376860-vortex-native/result.json) | 64³ | packed4 | 6.881 / 6.947 | 1.049 | 1.00× | 10.002 | 11.00 | 262144 / 262144 | 0.000e+0 |
| [2026-11-06T12-41-46-152Z-376860-vortex-native](runs/2026-11-06T12-41-46-152Z-376860-vortex-native/result.json) | 64³ | fft-real8 | 1.376 / 4.194 | 1.245 | 3.03× | 6.472 | 14.13 | 262144 / 262144 | 3.874e-7 |
| [2026-11-06T12-41-46-152Z-376860-vortex-native](runs/2026-11-06T12-41-46-152Z-376860-vortex-native/result.json) | 64³ | fft-real8-inline | 1.114 / 1.311 | 0.852 | 4.03× | 3.206 | 12.13 | 262144 / 262144 | 3.874e-7 |
| [2026-11-06T12-41-46-152Z-376860-vortex-native](runs/2026-11-06T12-41-46-152Z-376860-vortex-native/result.json) | 128³ | packed4 | 58.786 / 59.441 | 2.163 | 1.00× | 64.307 | 88.00 | 2097152 / 2097152 | 0.000e+0 |
| [2026-11-06T12-41-46-152Z-376860-vortex-native](runs/2026-11-06T12-41-46-152Z-376860-vortex-native/result.json) | 128³ | fft-real8-inline | 9.372 / 10.158 | 2.294 | 5.25× | 13.503 | 94.50 | 2097152 / 2097152 | 4.247e-7 |
| [2026-11-06T12-41-46-152Z-376860-vortex-native](runs/2026-11-06T12-41-46-152Z-376860-vortex-native/result.json) | 128³ | fft-real8 | 8.716 / 31.654 | 2.163 | 5.60× | 14.997 | 110.50 | 2097152 / 2097152 | 4.247e-7 |

## JavaScript initialization

These are initialization-only measurements, including output allocation and any GC pauses. The output is bitwise checked against the frozen scalar implementation. Fifteen samples per method/size, five shuffled rounds; no forced GC or discarded slow samples.

| Run | Grid | Method | Median / p95 ms | Initialization speedup |
|---|---:|---|---:|---:|
| [2026-11-06T12-14-53-813Z-336030-js-init-chromium](runs/2026-11-06T12-14-53-813Z-336030-js-init-chromium/result.json) | 64³ | scalar | 95.240 / 166.005 | 1.00× |
| [2026-11-06T12-14-53-813Z-336030-js-init-chromium](runs/2026-11-06T12-14-53-813Z-336030-js-init-chromium/result.json) | 64³ | table | 8.860 / 17.265 | 10.75× |
| [2026-11-06T12-14-53-813Z-336030-js-init-chromium](runs/2026-11-06T12-14-53-813Z-336030-js-init-chromium/result.json) | 128³ | scalar | 756.580 / 1112.570 | 1.00× |
| [2026-11-06T12-14-53-813Z-336030-js-init-chromium](runs/2026-11-06T12-14-53-813Z-336030-js-init-chromium/result.json) | 128³ | table | 92.745 / 152.890 | 8.16× |
| [2026-11-06T12-15-18-420Z-336030-js-init-firefox](runs/2026-11-06T12-15-18-420Z-336030-js-init-firefox/result.json) | 64³ | scalar | 48.360 / 75.120 | 1.00× |
| [2026-11-06T12-15-18-420Z-336030-js-init-firefox](runs/2026-11-06T12-15-18-420Z-336030-js-init-firefox/result.json) | 64³ | table | 9.000 / 19.260 | 5.37× |
| [2026-11-06T12-15-18-420Z-336030-js-init-firefox](runs/2026-11-06T12-15-18-420Z-336030-js-init-firefox/result.json) | 128³ | scalar | 319.120 / 465.960 | 1.00× |
| [2026-11-06T12-15-18-420Z-336030-js-init-firefox](runs/2026-11-06T12-15-18-420Z-336030-js-init-firefox/result.json) | 128³ | table | 63.140 / 87.760 | 5.05× |
| [2026-11-06T12-22-56-128Z-348217-js-init-chromium](runs/2026-11-06T12-22-56-128Z-348217-js-init-chromium/result.json) | 64³ | table | 15.105 / 22.850 | 7.93× |
| [2026-11-06T12-22-56-128Z-348217-js-init-chromium](runs/2026-11-06T12-22-56-128Z-348217-js-init-chromium/result.json) | 64³ | plane | 14.375 / 31.310 | 8.34× |
| [2026-11-06T12-22-56-128Z-348217-js-init-chromium](runs/2026-11-06T12-22-56-128Z-348217-js-init-chromium/result.json) | 64³ | scalar | 119.845 / 171.055 | 1.00× |
| [2026-11-06T12-22-56-128Z-348217-js-init-chromium](runs/2026-11-06T12-22-56-128Z-348217-js-init-chromium/result.json) | 128³ | table | 89.420 / 141.840 | 8.82× |
| [2026-11-06T12-22-56-128Z-348217-js-init-chromium](runs/2026-11-06T12-22-56-128Z-348217-js-init-chromium/result.json) | 128³ | scalar | 788.640 / 1097.150 | 1.00× |
| [2026-11-06T12-22-56-128Z-348217-js-init-chromium](runs/2026-11-06T12-22-56-128Z-348217-js-init-chromium/result.json) | 128³ | plane | 78.965 / 101.805 | 9.99× |
| [2026-11-06T12-23-29-191Z-348217-js-init-firefox](runs/2026-11-06T12-23-29-191Z-348217-js-init-firefox/result.json) | 64³ | table | 10.040 / 21.820 | 4.31× |
| [2026-11-06T12-23-29-191Z-348217-js-init-firefox](runs/2026-11-06T12-23-29-191Z-348217-js-init-firefox/result.json) | 64³ | plane | 6.960 / 17.760 | 6.21× |
| [2026-11-06T12-23-29-191Z-348217-js-init-firefox](runs/2026-11-06T12-23-29-191Z-348217-js-init-firefox/result.json) | 64³ | scalar | 43.240 / 59.580 | 1.00× |
| [2026-11-06T12-23-29-191Z-348217-js-init-firefox](runs/2026-11-06T12-23-29-191Z-348217-js-init-firefox/result.json) | 128³ | table | 59.440 / 86.840 | 5.23× |
| [2026-11-06T12-23-29-191Z-348217-js-init-firefox](runs/2026-11-06T12-23-29-191Z-348217-js-init-firefox/result.json) | 128³ | scalar | 310.980 / 390.500 | 1.00× |
| [2026-11-06T12-23-29-191Z-348217-js-init-firefox](runs/2026-11-06T12-23-29-191Z-348217-js-init-firefox/result.json) | 128³ | plane | 52.860 / 65.680 | 5.88× |

[Machine-readable comparison](optimization-log.json). Regenerate with node scripts/reports/optimization.mjs.
