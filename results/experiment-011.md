# Experiment 011: factoring surface normals and sizing patches

The frozen baseline is commit `196e314`: 8×8 instanced indices and five point evaluations per normal. All candidates retain the same 512×256 cells, 262,144 triangles, camera, lighting, and 1280×720 render target.

## Measurements

| Run / browser / mode | Completed batch ms/frame | GPU ms/frame | CPU % | GPU render % | Browser PSS MiB | Index bytes | Owned GPU textures MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-11-06T15-00-01 / chromium / frozen-011 | 1.000 | 0.587 | 26.0 | 60.5 | 438.5 | 768 | 7.043 |
| 2026-11-06T15-00-01 / chromium / patch16 | 0.913 | 0.570 | 26.0 | 60.4 | 441.1 | 3072 | 7.043 |
| 2026-11-06T15-00-01 / chromium / patch32 | 0.931 | 0.559 | 24.0 | 60.1 | 442.2 | 12288 | 7.043 |
| 2026-11-06T15-00-01 / chromium / patch64 | 0.924 | 0.552 | 24.0 | 60.1 | 442.4 | 49152 | 7.043 |
| 2026-11-06T15-00-01 / chromium / tiled | 0.922 | 0.553 | 26.0 | 59.4 | 446.9 | 3145728 | 7.043 |
| 2026-11-06T15-00-38 / firefox / frozen-011 | 1.358 | — | 24.0 | 62.3 | 496.2 | 768 | 7.043 |
| 2026-11-06T15-00-38 / firefox / patch16 | 1.916 | — | 116.0 | 62.7 | 511.0 | 3072 | 7.043 |
| 2026-11-06T15-00-38 / firefox / patch32 | 1.469 | — | 63.9 | 62.3 | 484.7 | 12288 | 7.043 |
| 2026-11-06T15-00-38 / firefox / patch64 | 1.378 | — | 50.0 | 61.6 | 495.4 | 49152 | 7.043 |
| 2026-11-06T15-00-38 / firefox / tiled | 1.560 | — | 22.0 | 61.1 | 493.6 | 3145728 | 7.043 |
| 2026-11-06T15-06-09 / chromium / frozen-011 | 1.115 | 0.706 | 26.0 | 61.0 | 428.7 | 768 | 7.043 |
| 2026-11-06T15-06-09 / chromium / factored8 | 1.053 | 0.663 | 24.0 | 60.5 | 431.6 | 768 | 7.043 |
| 2026-11-06T15-06-09 / chromium / factored32 | 1.018 | 0.603 | 24.0 | 59.7 | 432.1 | 12288 | 7.043 |
| 2026-11-06T15-06-32 / firefox / frozen-011 | 1.462 | — | 24.0 | 61.3 | 536.0 | 768 | 7.043 |
| 2026-11-06T15-06-32 / firefox / factored8 | 1.450 | — | 30.0 | 60.6 | 535.2 | 768 | 7.043 |
| 2026-11-06T15-06-32 / firefox / factored32 | 1.234 | — | 35.9 | 61.4 | 552.4 | 12288 | 7.043 |
| 2026-11-06T15-08-48 / chromium / frozen-011 | 1.046 | 0.794 | 12.0 | 73.6 | 430.6 | 768 | 7.043 |
| 2026-11-06T15-08-48 / chromium / factored32 | 0.926 | 0.714 | 12.0 | 74.7 | 434.2 | 12288 | 7.043 |
| 2026-11-06T15-09-05 / firefox / frozen-011 | 0.877 | — | 12.0 | 76.8 | 559.8 | 768 | 7.043 |
| 2026-11-06T15-09-05 / firefox / factored32 | 0.840 | — | 18.0 | 66.6 | 532.6 | 12288 | 7.043 |

Medians average the two middle samples for even counts and summarize completed batch averages, not display FPS or input latency. GPU timers are unavailable in this Firefox configuration. CPU 100% is one core. GPU utilization is Intel render-client busy time. Cases alternate order across rounds inside a fresh browser session; PSS snapshots include browser startup, earlier cases, caches and automation and are not isolated scene increments. Do not compare those PSS snapshots as a causal memory-saving percentage. Explicit textures include library color/depth targets and exclude the browser framebuffer. The JSON summary includes setup, CPU/GPU statistics, RSS, PSS, resident GPU memory, and retained errors.

## Selection and limits

Larger patches alone were not a consistent Firefox win. The selected torus path uses a 32×32 patch, preserving the inner 8×8 triangle order. Its index allocation is 12,288 bytes: 11,520 bytes more than the previous default, and 256 times smaller than the original 3 MiB mesh. Small grids retain 8×8 patches. This is a bounded index-memory tradeoff, not a total-RAM reduction.

The [factored normal derivation](../docs/surface-performance.md) uses angle-addition identities for the exact discrete central differences, not continuous analytic normals. Boundary rows keep the original one-sided differences. Position, topology, shading constants and image gates remain unchanged. User-defined parametric surfaces retain sampled finite differences; the torus formula does not apply to arbitrary maps. Earlier metadata estimated the procedural animation payload as 32 bytes; the actual scalar/vector uniform arguments total 28 bytes, now corrected. This is logical payload, not measured driver traffic.

The short-batch confirmation measured 1.115 → 1.018 ms in Chromium and 1.462 → 1.234 ms in Firefox. The independent 32-frame-batch follow-up measured 1.046 → 0.926 ms in Chromium and 0.877 → 0.840 ms in Firefox. The Firefox benefit is smaller under the longer timing protocol; these active-desktop tests do not establish a universal gain or another 10× speedup. Both protocols pass five-phase ManimGL image checks.

## Retained attempts

- [2026-11-06T15-00-01-737Z-596852-patches-chromium](runs/2026-11-06T15-00-01-737Z-596852-patches-chromium/result.json): complete, parity passed.
  - [frozen-011 frame comparisons](runs/2026-11-06T15-00-01-737Z-596852-patches-chromium/frozen-011-comparison.png).
  - [patch16 frame comparisons](runs/2026-11-06T15-00-01-737Z-596852-patches-chromium/patch16-comparison.png).
  - [patch32 frame comparisons](runs/2026-11-06T15-00-01-737Z-596852-patches-chromium/patch32-comparison.png).
  - [patch64 frame comparisons](runs/2026-11-06T15-00-01-737Z-596852-patches-chromium/patch64-comparison.png).
  - [tiled frame comparisons](runs/2026-11-06T15-00-01-737Z-596852-patches-chromium/tiled-comparison.png).
- [2026-11-06T15-00-38-098Z-596852-patches-firefox](runs/2026-11-06T15-00-38-098Z-596852-patches-firefox/result.json): complete, parity passed.
  - [frozen-011 frame comparisons](runs/2026-11-06T15-00-38-098Z-596852-patches-firefox/frozen-011-comparison.png).
  - [patch16 frame comparisons](runs/2026-11-06T15-00-38-098Z-596852-patches-firefox/patch16-comparison.png).
  - [patch32 frame comparisons](runs/2026-11-06T15-00-38-098Z-596852-patches-firefox/patch32-comparison.png).
  - [patch64 frame comparisons](runs/2026-11-06T15-00-38-098Z-596852-patches-firefox/patch64-comparison.png).
  - [tiled frame comparisons](runs/2026-11-06T15-00-38-098Z-596852-patches-firefox/tiled-comparison.png).
- [2026-11-06T15-06-09-831Z-609345-patches-chromium](runs/2026-11-06T15-06-09-831Z-609345-patches-chromium/result.json): complete, parity passed.
  - [frozen-011 frame comparisons](runs/2026-11-06T15-06-09-831Z-609345-patches-chromium/frozen-011-comparison.png).
  - [factored8 frame comparisons](runs/2026-11-06T15-06-09-831Z-609345-patches-chromium/factored8-comparison.png).
  - [factored32 frame comparisons](runs/2026-11-06T15-06-09-831Z-609345-patches-chromium/factored32-comparison.png).
- [2026-11-06T15-06-32-721Z-609345-patches-firefox](runs/2026-11-06T15-06-32-721Z-609345-patches-firefox/result.json): complete, parity passed.
  - [frozen-011 frame comparisons](runs/2026-11-06T15-06-32-721Z-609345-patches-firefox/frozen-011-comparison.png).
  - [factored8 frame comparisons](runs/2026-11-06T15-06-32-721Z-609345-patches-firefox/factored8-comparison.png).
  - [factored32 frame comparisons](runs/2026-11-06T15-06-32-721Z-609345-patches-firefox/factored32-comparison.png).
- [2026-11-06T15-08-48-477Z-613879-patches-chromium](runs/2026-11-06T15-08-48-477Z-613879-patches-chromium/result.json): complete, parity passed.
  - [frozen-011 frame comparisons](runs/2026-11-06T15-08-48-477Z-613879-patches-chromium/frozen-011-comparison.png).
  - [factored32 frame comparisons](runs/2026-11-06T15-08-48-477Z-613879-patches-chromium/factored32-comparison.png).
- [2026-11-06T15-09-05-358Z-613879-patches-firefox](runs/2026-11-06T15-09-05-358Z-613879-patches-firefox/result.json): complete, parity passed.
  - [frozen-011 frame comparisons](runs/2026-11-06T15-09-05-358Z-613879-patches-firefox/frozen-011-comparison.png).
  - [factored32 frame comparisons](runs/2026-11-06T15-09-05-358Z-613879-patches-firefox/factored32-comparison.png).

Reproduce: `npm run bench:patches`; then `npm run bench:patches -- --variants=frozen-011,factored8,factored32`; then `npm run bench:patches -- --variants=frozen-011,factored32 --frames=192 --batch-size=32`.
Regenerate both reports with `npm run report:surfaces`.
