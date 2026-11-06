# Surface performance notes

## Factored discrete normals

The procedural torus uses radius `r = 0.62 + 0.1 sin(6u + 2v − phase)`, with position `((2 + r cos(v)) cos(u), (2 + r cos(v)) sin(u), r sin(v) + 0.2 sin(3u + phase))`, followed by a rigid rotation. The reference normal is the cross product of discrete neighbor differences, not continuous derivatives.

Let `w = 6u + 2v − phase`, `h` be the u sampling step and `k` the v sampling step. Angle addition gives the exact symmetric radius differences and averages:

```text
Δr_u = 0.2 cos(w) sin(6h)
 r̄_u = 0.62 + 0.1 sin(w) cos(6h)
Δr_v = 0.2 cos(w) sin(2k)
 r̄_v = 0.62 + 0.1 sin(w) cos(2k)
```

For the u tangent, define `A = cos(h) Δr_u cos(v)` and `B = 2 sin(h) (2 + r̄_u cos(v))`. Then the unrotated neighbor difference is:

```text
du = (cos(u) A − sin(u) B,
      sin(u) A + cos(u) B,
      Δr_u sin(v) + 0.4 cos(3u + phase) sin(3h))
```

For the v tangent, define `C = Δr_v cos(v) cos(k) − 2 r̄_v sin(v) sin(k)`:

```text
dv = (C cos(u), C sin(u),
      Δr_v sin(v) cos(k) + 2 r̄_v cos(v) sin(k))
```

Rigid rotation commutes with subtraction, so rotate both differences before taking their cross product. Sampling-step trigonometric values are uniforms uploaded during initialization. At boundary rows, clamping makes the reference differences one-sided; those rows keep explicit neighbor evaluation. Floating-point rounding still differs, so native image comparisons remain the acceptance gate.

This identity applies only to the procedural torus formula. Arbitrary maps use sampled positions and the native-style neighboring-row fallback at collapsed poles. No continuous-normal approximation is substituted for the native finite differences.

## Index patches

A reusable `p × p` cell patch contains `(p + 1)²` local vertices and `6p²` unsigned 16-bit indices. Its index allocation is `12p²` bytes. The vertex shader reconstructs global coordinates using instance ID and local vertex ID. Partial patches clamp extra vertices into degenerate triangles; tests compare the complete oriented triangle multiset.

The 32×32 patch retains 8×8 ordering internally for locality, reduces instance count from 2,048 to 128 on the dense fixture, and increases index storage from 768 to 12,288 bytes. The change is accepted as a small explicit memory cost for measured throughput. Larger patches alone were not consistently faster across browsers. [WebGL2 instanced draw semantics](https://registry.khronos.org/webgl/specs/latest/2.0/) define the relevant draw behavior.

## Sampled transforms

Each sampled endpoint uses RGBA32F: xyz positions and an RGB8 color packed into the fourth component. Every unsigned 24-bit color integer is exactly representable in float32. The shader unpacks the two endpoint colors before interpolation, retaining continuous intermediate colors rather than requantizing each animation frame.

Two dense endpoints occupy `513 × 257 × 16 × 2 = 4,218,912` bytes. Without a changed target, both samplers bind one texture. Per-frame JavaScript updates only the interpolation alpha; positions, normals and colors are evaluated on the GPU. These are owned allocations and logical uniform payloads, not estimates of driver traffic or whole-browser RAM. Mapping callbacks and float32 sampling incur a one-time setup cost measured separately.

See [experiment 011](../results/experiment-011.md), [experiment 012](../results/experiment-012.md), and the [feature coverage](feature-parity.md) for measured limits.
