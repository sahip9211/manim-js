# Contributing

ManimJS is an early prototype. Small, independently measurable features are easier to review than broad API changes.

## Setup and checks

Use Node.js 22 or newer, then run `npm ci --ignore-scripts`. The development dependencies are pinned; none is required by consumers of the browser bundles.

```sh
npm test
npm run format:check
npm run build
```

`npm run format` formats active source and documentation. Generated bundles, raw results, and frozen baselines are excluded. For rendering changes, also run the relevant browser or GPU checks described in [desktop testing](docs/real-device-testing.md). Unsupported WebGPU must be reported separately from a failing WebGL2 check.

## Organization

Keep library APIs in `src/`, research fixtures in `experiments/`, and browser examples in `examples/` or `lab/`. Command-line benchmark entry points belong in `scripts/benchmarks/`; reusable automation and telemetry belong in `scripts/lib/`. Prefer the npm commands so callers do not depend on internal script paths.

Do not add one-off device probes when the existing compatibility runner already records the capability. Preserve distinct benchmark runners when they are needed to reproduce published comparisons. Reference repositories belong in the ignored `vendor/` directory.

## Performance changes

Record the workload, browser/runtime, adapter, settings, source version, and correctness limits. Compare equally instrumented paired runs at the same quality. Keep startup, GPU execution, submission/completion, and presentation timing separate. Document failed attempts and unavailable counters. See [the measurement protocol](docs/research-plan.md).

Do not modify frozen baseline algorithms to improve a candidate's result. Archived sources describe earlier experiments and may use older internal names. When preparing data for publication, remove personal paths and conversation context, document the redaction, and update any affected source hashes. Never alter measured numeric values as part of cleanup.

## Licensing

Original contributions use the repository's MIT license. Preserve copyright and license notices for incorporated third-party code, including translated ManimGL code, and update `THIRD_PARTY_NOTICES.md` when needed.
