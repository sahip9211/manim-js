# ManimJS

Mathematical graphics and animation for the browser, inspired by [ManimGL](https://github.com/3b1b/manim). ManimJS uses its own renderer and ships as a self-contained JavaScript file with no runtime dependencies.

**Early research prototype.** The current API provides a frame scheduler, an experimental animated grid, and a shaded animated torus. A general scene API, text, equations, and a complete animation system are still under development. Python ManimGL scenes cannot run directly in this library.

## Try it

Clone the repository and build with Node.js 22 or newer:

```sh
git clone https://github.com/sahip9211/manim-js.git
cd manim-js
npm ci --ignore-scripts
npm run build
npm run dev
```

Open `http://127.0.0.1:4173/examples/standalone.html`. The package is not published to npm yet.

For an ordinary HTML page, copy `dist/manim.js` beside the page:

```html
<canvas id="view" width="640" height="480"></canvas>
<script src="manim.js"></script>
<script>
  ManimJS.experimental.createGrid(document.querySelector('#view'))
    .then(grid => grid.play());
</script>
```

An ES module build is also available:

```js
import { experimental } from './manim.module.js';
const grid = await experimental.createGrid(document.querySelector('canvas'));
grid.play();
// Release owned resources when the scene is removed.
// grid.dispose();
```

Both builds are independent single files. Neither downloads shaders, workers, WebAssembly, or other assets. [The build manifest](dist/manifest.json) records file sizes, hashes, and external-import checks.

## Animated surface

[The travelling-wave torus example](examples/wave-torus.html) renders 262,144 animated triangles with perspective, lighting, and depth testing:

```js
const scene = await ManimJS.experimental.createWaveTorus(canvas);
scene.play();
// Deterministically render a phase for inspection or export:
scene.render(0.7);
```

It uses WebGL2 in both Firefox and Chromium. `set({ phase })`, `play()`, `pause()`, and `dispose()` follow the grid lifecycle. Automatic animation stops when hidden; explicit `render(phase)` also works for offscreen capture. Keep a 16:9 canvas for the current default camera and recreate the scene after resizing. The surface remains an experimental fixture, not a general scene interpreter.

[ManimGL comparison and frame captures](results/experiment-009.md) document matching images, timing, and CPU/RAM/GPU measurements. On the recorded dense-torus workload, the tiled renderer completes frames about 13× faster in Chromium and 16× faster in Firefox even against the fastest full native repeat. These are offscreen throughput results, not displayed FPS or whole-library speedups. Browser process-tree RAM is higher despite smaller geometry buffers. [Reproduce the comparison](docs/manimgl-parity.md).

## Rendering and compatibility

The grid uses WebGL2 by default. Pass `{ backend: 'webgpu' }` on a fresh canvas to explicitly select WebGPU where supported; it requires a secure context. Animation pauses when hidden or offscreen. Call `dispose()` to release a scene. Canvas resizing currently requires recreating the grid to recalculate its pixel-error budget. Lines are thin and un-antialiased.

The standalone example and WebGL2 checks pass in installed Chromium and Firefox on the recorded Linux hardware. Experimental WebGPU runs are labeled separately from default-browser support. See [desktop testing](docs/real-device-testing.md) for configuration and limitations.

## Development

```sh
npm test
npm run format:check
npm run build
npm run check:browsers -- --headed --system-firefox
```

The browser command uses installed Chromium and Firefox with isolated profiles. On Hyprland, headed tests open silently on workspace 5; `MANIM_JS_TEST_WORKSPACE` overrides that choice. Other environments use normal browser placement. See [contributing](CONTRIBUTING.md) for the source layout and validation workflow.

## Performance research

The rendering experiments compare geometry updates, shared curves, shader strategies, and compute-heavy fluid workloads. These fixtures are separate from the distributed library. Fluid benchmarks are graphics stress tests, not validated computational-fluid-dynamics solvers.

- [Experiment index, raw data, and measurement conventions](results/README.md)
- [Latest comparison against the frozen FFT baseline](results/experiment-008.md)
- [Algorithm and engine research](docs/performance-research.md)
- [Measurement protocol and feature roadmap](docs/research-plan.md)

The latest conditional symmetry optimization reduces simulation-plus-render GPU time by **3.69× in Chromium and 4.55× in Firefox at 128³**, compared with an already optimized FFT implementation in paired runs. It requires exact input symmetries and is not a general dense-field speedup. The additional 10× research target has not been reached. GPU execution time is not displayed-frame latency.

```sh
npm run bench:vortex -- --quick
npm run bench:rebased:browser -- --candidates=fft-real8-symmetry
npm run report:rebased
```

Full runs preserve numerical checks, source snapshots, timing samples, CPU/RAM measurements, and available GPU counters. Failed attempts remain visible. Inspect the recorded workload and adapter before comparing results.

## Repository layout

```text
src/                 Library API and scheduling
experiments/         Rendering and simulation fixtures; frozen baselines
examples/            Plain HTML integration
lab/                 Interactive browser checks and previews
scripts/benchmarks/  Benchmark and profiling entry points
scripts/checks/      Build, browser, and desktop validation
scripts/reports/     Results aggregation and reference manifests
scripts/lib/         Browser automation and measurement helpers
tests/               Mathematical and lifecycle tests
docs/                Architecture, research, and testing guides
results/             Reports, raw measurements, and archived sources
dist/                Self-contained browser builds
```

`vendor/` contains optional, Git-ignored research checkouts. It is not required to build or use ManimJS.

## License and attribution

[MIT](LICENSE). ManimJS is an independent project and is not affiliated with or endorsed by 3Blue1Brown. See [third-party notices](THIRD_PARTY_NOTICES.md) for ManimGL attribution and research references.
