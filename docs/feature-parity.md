# ManimGL feature coverage

ManimJS is an independent JavaScript library with a growing subset of ManimGL behavior. It does not execute Python scenes. The comparison reference is ManimGL revision `fafa083a4fb274bba9cabde0b6e2f50ba6da0622`; that revision uses WGPU despite the project name. Upstream documentation and examples: [ManimGL](https://3b1b.github.io/manim/).

| Capability                   | Current behavior                                                                                        | Validation and limits                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Parametric `Surface`         | User-defined `map(u, v)` sampled over two parameter ranges; configurable grid resolution and RGB colors | Opaque regular grids only; finite float32 coordinates; RGB8 endpoint colors                               |
| `Transform` between surfaces | GPU interpolation between two maps and colors on the same grid                                          | Straight paths only; five image comparisons against actual native `Transform` at 262,144 triangles        |
| Surface shading and normals  | Native-style perspective, lighting and finite differences; neighboring-row fallback for collapsed poles | Dense torus morph validated; arbitrary maps and singularities are not all covered                         |
| Animation timing             | Duration, normalized seek, play, pause, linear and quintic smooth easing                                | Deterministic timeline tests, hidden-time suspension and zero continuing callbacks at completion          |
| Procedural torus             | Travelling waves and rotation evaluated on the GPU                                                      | Five reference frames; factored discrete normals and bounded index-memory optimization                    |
| Grid deformation             | Animated mathematical grid with an error-bounded representation                                         | Existing browser and mathematical checks; thin, un-antialiased lines                                      |
| Lifecycle                    | Ordinary disposal permits canvas reuse; explicit terminal context release                               | Real Chromium/Firefox checks; static surfaces share their endpoint texture                                |
| Scene graph and groups       | Not implemented                                                                                         | No general `Scene`, multiple independent mobjects, hierarchy or general batching API                      |
| Curves and strokes           | Not implemented as general Manim objects                                                                | No general Circle, Arrow, Bézier stroke, fills or ShowCreation                                            |
| Text and equations           | Not implemented                                                                                         | No Text, Tex, glyph shaping or LaTeX renderer                                                             |
| Other animations             | Not implemented                                                                                         | No path arcs, unequal-grid alignment, fades/transparency, AnimationGroup, updaters or matching transforms |
| Camera and output            | Fixed-size canvas and configurable low-level camera parameters                                          | No interactive camera API, automatic resize, video export or context-loss recovery                        |

## Parametric surface API

```js
const surface = await ManimJS.experimental.createSurface(canvas, {
  map: (u, v) => [u, v, 0],
  targetMap: (u, v) => [u, v, 0.3 * Math.sin(3 * u) * Math.cos(3 * v)],
  uRange: [-2, 2],
  vRange: [-1.5, 1.5],
  uSegments: 128,
  vSegments: 96,
  color: [0.2, 0.6, 0.9],
  targetColor: [0.9, 0.4, 0.6],
  duration: 3,
  easing: 'smooth',
});
surface.play();
surface.pause();
surface.seek(0.5);
const png = canvas.toDataURL(); // Capture synchronously after seek.
surface.dispose({ releaseContext: true }); // Discard this canvas permanently.
```

Defaults: 100 segments per axis, ranges `[0, 1]`, color `[0.3, 0.7, 0.9]`, two-second duration and smooth easing. `targetMap` defaults to the source map and `targetColor` defaults to the source color. With neither target changed, both samplers share one GPU texture. `color` and `targetColor` can also be callbacks `(u, v) => [r, g, b]`, with components in `[0, 1]`. The current API intentionally supports opaque RGB, not alpha.

A map may write into the provided reusable output vector instead of allocating a return array: `map(u, v, out) { out[0] = u; out[1] = v; out[2] = 0; }`. Callback code runs during creation, never during playback. Changing endpoint functions requires creating another surface. Coordinates are sampled to float32 and endpoint colors to RGB8; no automatic adaptive subdivision occurs.

`seek(progress)` accepts `[0, 1]` and applies the selected easing. Use `easing: 'linear'` when progress should equal geometric interpolation alpha. Seeking renders immediately, even when hidden. `play()` resumes or restarts from zero after reaching the target. Normal playback suspends while hidden, pauses without advancing time, and stops scheduling frames at completion. Read `progress` and `playing` to reflect playback in controls. Dispose with no arguments to reuse the same canvas; use `releaseContext: true` only when discarding it. A fresh canvas is required when switching to the optional direct-canvas target from a depthless context.

Use a 16:9 canvas for the default camera and recreate the renderer after changing its drawing-buffer dimensions. Keep the capture in the same task as `seek()` because the canvas drawing buffer is not preserved. Both classic-script and ESM builds contain the complete API without runtime imports.

## Performance contract

The dense morph stores 4.023 MiB of endpoint textures and uploads one four-byte alpha per rendered frame. Shader work scales with visible geometry, but JavaScript performs no per-vertex interpolation or geometry upload during playback. Sampling and texture upload are upfront costs. Browser process memory includes browser infrastructure and caches; explicit texture sizes do not describe whole-browser RAM.

The procedural torus uses a separate factored finite-difference path. Its 32×32 index patch occupies 12 KiB; smaller grids use 8×8 patches. The sampled-surface normal computation remains general. [Experiment 011](../results/experiment-011.md) records rejected patch candidates, the discrete-normal derivation, and repeated timing. [Experiment 012](../results/experiment-012.md) records native Transform parity, endpoint costs, CPU/RAM/GPU counters, captures, and the failed instrumentation attempt.

The next parity increments should retain these gates: matching output before accepting performance results, separate startup and steady-state measurements, explicit resource accounting, and default Firefox/Chromium compatibility. Full ManimGL feature parity remains unfinished.
