# Experiments and measurements

| Series | Subject | Report |
| --- | --- | --- |
| 001 | CPU updates and GPU grid deformation | [Report](experiment-001.md) |
| 002 | Shared curve representation | [Report](experiment-002.md) |
| 003 | Fluid stress workload | [Report](experiment-003.md) |
| 004 | Pressure-kernel optimization | [Report](experiment-004.md) |
| 005 | Vectorized pressure and browser hardware | [Report](experiment-005.md) |
| 006 | 3D Taylor–Green vortex and FFT pressure | [Report](experiment-006.md) |
| 007 | Real FFT, shader layouts, and JavaScript initialization | [Attempt log](optimization-log.md) |
| 008 | Further optimization against a frozen FFT baseline | [Report](experiment-008.md), [attempt log](rebased-log.md) |

Each instrumented directory in `runs/` contains `result.json` and `telemetry.json`. Where available, `sources/` and source-hash manifests preserve the implementation used for that run. GPU images, numerical checks, and failure details accompany the measurements. Earlier uninstrumented runs remain at this directory's top level.

Regenerate aggregate tables with `npm run report:runs`, `npm run report:optimization`, and `npm run report:rebased`. Run these from the repository root. Archived sources use the layout and working names that existed at measurement time; they are evidence, not the current package API.

## ManimGL animation comparison

[Experiment 009](experiment-009.md) compares a dense animated torus with the pinned ManimGL renderer, including pixel parity, CPU/RAM/GPU telemetry, and retained instrumentation failures. [Reproduction instructions](../docs/manimgl-parity.md).

## Surface memory comparison

[Experiment 010](experiment-010.md) compares the frozen tiled renderer with instanced patches and direct canvas rendering. It separates blank-browser overhead from scene allocations using RSS, PSS, private memory, and repeated disposal checkpoints. Run `npm run report:memory` to regenerate the report.

## Surface performance and feature parity

[Experiment 011](experiment-011.md) tests patch sizes and factored discrete normals against the frozen memory-optimized renderer. [Experiment 012](experiment-012.md) adds general parametric surfaces and same-grid morphs compared with native ManimGL `Transform`. Run `npm run report:surfaces` to regenerate both reports.

## Interpreting the data

GPU pass times, CPU submission time, queue completion, and displayed-frame latency are different measurements. Whole-run memory/CPU values include setup, validation, and sampling. Process-tree RSS may count shared pages more than once. GPU buffer accounting excludes driver allocations. Unavailable counters are null, not zero. Experimental WebGPU settings and background-workspace measurements are labeled in each run.

Short active-desktop runs are not thermal steady-state tests. Relative improvements apply to the recorded workload and baseline, not to all scenes or hardware. Failed and blocked runs do not establish compatibility or performance.

## Publication cleanup

Before the first public commit, personal checkout paths in errors were replaced with `/workspace/manim-js`, and conversation-specific comments in archived automation were rewritten as technical descriptions. Source-hash references were updated for those comment-only edits. Numeric measurements and shader algorithms were preserved. The executable frozen baseline `experiments/baselines/vortex-008.js` remains byte-for-byte unchanged.
