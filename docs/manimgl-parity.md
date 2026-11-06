# ManimGL surface parity experiment

The benchmark compares one animated parametric surface with ManimGL at revision `fafa083a4fb274bba9cabde0b6e2f50ba6da0622`. That checkout uses WGPU, despite the historical ManimGL name. It is left unmodified. This experiment establishes parity for the travelling-wave torus, not for ManimGL's complete scene, text, stroke, or animation APIs.

## Workload and implementation

A torus carries travelling radial waves and rotates in three dimensions. Both implementations render 512×256 cells, or 262,144 triangles, at 1280×720. The sample points, triangle orientation, camera perspective, vertex colors, finite-difference normals, lighting, depth test, and sample count match. No geometry is decimated and no frame is pre-rendered or reused.

The reference precomputes separable trigonometric factors, updates coordinates with vectorized NumPy operations, and calls `Camera.capture(surface)` directly. High-level scene playback, CLI startup, and video encoding are excluded. Its render bundles and batching remain enabled. The native GPU timestamp wrapper adds optional timestamp writes without changing rendering. WGPU timestamp ticks are multiplied by the native device's timestamp period.

ManimJS moves parametric evaluation into the vertex shader. The `direct` mode evaluates trigonometry in the shader. `basis` uses compact one-dimensional tables and angle-addition identities. `tiled` uses the same basis shader and orders identical triangles in 8×8 blocks to improve vertex reuse. The default, `instanced`, reuses a single 32×32 patch on dense grids (8×8 on smaller grids) with 16-bit indices and reconstructs each patch location from the instance ID. Partial edge patches clamp extra vertices to degenerate triangles. The tile ordering is independently tested to preserve the exact oriented triangle set. The general motivation for triangle locality is described in [meshoptimizer's vertex-cache documentation](https://github.com/zeux/meshoptimizer#vertex-cache-optimization); no meshoptimizer runtime or code is included.

Projection, shading, and normal construction are adapted from ManimGL's MIT-licensed shaders. Attribution is preserved in source, the distribution banner, and [third-party notices](../THIRD_PARTY_NOTICES.md).

## Reproduce

The Python environment and reference checkout are development-only inputs, excluded from Git and browser bundles. The commands below create them under `vendor/`:

```sh
git clone https://github.com/3b1b/manim.git vendor/manimgl
git -C vendor/manimgl checkout fafa083a4fb274bba9cabde0b6e2f50ba6da0622
uv venv --python 3.12 vendor/manimgl-venv
uv pip install --python vendor/manimgl-venv/bin/python -r experiments/parity/requirements.txt
uv pip install --python vendor/manimgl-venv/bin/python --no-deps -e vendor/manimgl
npm ci --ignore-scripts
npm run bench:parity
npm run report:parity
```

ManimPango may require Pango/Cairo development headers. Use an existing checkout if `vendor/manimgl` already exists. `MANIM_JS_PYTHON` selects another Python environment. The reference explicitly selects an Intel adapter by default; `MANIM_JS_REFERENCE_ADAPTER` can select another adapter. Browser and native results must identify the same physical GPU for a same-device comparison.

`--quick` is a smaller screening run, not the full workload. `--browser=chromium`, `--browser=firefox`, or `--browser=none` select browser comparisons or a native-only repeat. `--modes=direct,basis,tiled,instanced` compares all modes. The default compares `tiled,instanced` with alternating order across three rounds.

## Measurement scope

Each timed case contains 48 animation steps in six batches, repeated over three rounds. Native completion waits on the GPU queue. Browser completion synchronously reads one framebuffer pixel per batch: early measurements using only `gl.finish()` were rejected because they did not establish completed GPU work in Chromium. Full-frame reads, PNG encoding, image checks, and query retrieval occur outside timed batches. Chromium GPU queries and native WGPU queries are reported separately; Firefox may not expose the timer extension.

A separate continuous three-second interval per mode supplies process-tree CPU/RAM and DRM client utilization/memory samples. It does not wait for display refresh. Browser infrastructure contributes to RAM; process-tree RSS can count shared pages more than once. GPU buffers, render targets, and driver-resident memory are different quantities. Do not add them together or equate lower GPU utilization with higher efficiency when throughput differs.

Headed browser windows stay on workspace 5 without focus changes. These are offscreen render-throughput tests, not foreground FPS, video-export speed, or input-to-photon latency. They exclude video encoding in both implementations. Short runs on an active desktop do not characterize thermal steady state or all devices.

## Visual checks

Every mode captures the same five animation phases. Comparisons require nonempty images, a visible change between times, mean RGB channel error at most 0.5/255, interior p99 channel error at most 2/255, and silhouette mismatch at most 0.2%. Contact sheets show reference, candidate, and amplified differences; the full-size PNGs remain available for inspection.

See [the generated report](../results/experiment-009.md) for metrics, resource samples, capture links, and every retained attempt. Frozen sources and dependency versions accompany runs.

## Single-file integration check

`npm run build && npm run check:surface` loads the actual built bundle and HTML example in both browsers, captures three deterministic canvas frames, exercises playback controls, and verifies disposal. The recorded bundle captures were also compared against native reference phases 0, 0.7, and 3.4: every channel differed by at most one 8-bit value. [Combined visual preview](../results/parity-comparison.png).

## Memory follow-up

[Experiment 010](../results/experiment-010.md) freezes the earlier tiled renderer and compares it with instanced indices, leaner context attributes, direct canvas rendering, and terminal context disposal. Run `npm run bench:memory && npm run report:memory`. It reuses the committed native reference captures and camera; Python dependencies are still required for pixel comparisons. A fresh browser is used for every variant, with reversed order on the second pass.

The logs retain three `/proc/PID/smaps_rollup` snapshots per checkpoint, browser-only and whole-tree RSS/PSS/private memory, JavaScript heap where exposed, CPU and DRM GPU samples, frame completion, errors, and five image comparisons. PNG capture occurs after active-scene RAM measurements. A 12-cycle creation/disposal check tests resource retention without forcing garbage collection. The 15-second Firefox follow-up separates startup noise from the initial 1.5-second protocol.

The default remains offscreen rendering with instanced patches. Direct canvas rendering is opt-in; its explicit texture count excludes browser-owned framebuffer allocations. Capture the canvas synchronously after `render()` because preserved drawing buffers are disabled. `dispose({ releaseContext: true })` is intended for a canvas being permanently discarded. Ordinary `dispose()` retains context reuse.

`npm run check:surface` additionally tests partial meshes against the frozen renderer, reusing a canvas after disposal, and explicit terminal context loss in both browsers.

## General surfaces and Transform

`npm run bench:morph` runs the native `Transform` reference and the sampled JavaScript surface path. It preserves the shared camera, finite-difference shading and triangle topology while replacing procedural wave updates with a linear transform between two precomputed endpoint surfaces. RGB8 endpoint colors match in both implementations. See [experiment 012](../results/experiment-012.md) and [feature coverage](feature-parity.md).

`npm run bench:patches` compares the frozen `196e314` renderer against larger patches. Factored discrete normals are tested with `--variants=frozen-011,factored8,factored32`; use `--frames=192 --batch-size=32` for the longer-batch follow-up. Sources and counters are frozen per run.
