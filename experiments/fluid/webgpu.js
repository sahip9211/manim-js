import { initialFluid } from './model.js';
import { createFFTPressure } from './fft-pressure.js';
import { specializeGrid, temporalPressure, packedPressure } from './pressure-shaders.js';

const compute = (workgroup) => `
struct Params { n: u32, dt: f32, pad: vec2f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> p: array<f32>;
@group(0) @binding(4) var<storage, read_write> q: array<f32>;
@group(0) @binding(5) var<storage, read_write> div: array<f32>;
fn at(x: i32, y: i32) -> u32 { let n = i32(params.n); return u32(((y % n + n) % n) * n + ((x % n + n) % n)); }
@compute @workgroup_size(${workgroup}, ${workgroup}) fn advect(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.n || id.y >= params.n) { return; }
  let i = id.y * params.n + id.x;
  let back = vec2f(id.xy) - params.dt * src[i].xy;
  let base = vec2i(floor(back)); let f = fract(back);
  dst[i] = mix(mix(src[at(base.x, base.y)], src[at(base.x+1, base.y)], f.x), mix(src[at(base.x, base.y+1)], src[at(base.x+1, base.y+1)], f.x), f.y);
}
@compute @workgroup_size(${workgroup}, ${workgroup}) fn divergence(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.n || id.y >= params.n) { return; }
  let x = i32(id.x); let y = i32(id.y); let i = at(x,y);
  div[i] = src[i].x - src[at(x-1,y)].x + src[i].y - src[at(x,y-1)].y;
}
@compute @workgroup_size(${workgroup}, ${workgroup}) fn divergenceInit(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.n || id.y >= params.n) { return; }
  let x = i32(id.x); let y = i32(id.y); let i = at(x,y);
  let d = src[i].x - src[at(x-1,y)].x + src[i].y - src[at(x,y-1)].y;
  div[i] = d;
  // Jacobi starts from zero: its first iteration is exactly -div / 4.
  // Initialize the first pressure state here, avoiding two clears and a pass.
  q[i] = -0.25 * d;
}
@compute @workgroup_size(${workgroup}, ${workgroup}) fn jacobi(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.n || id.y >= params.n) { return; }
  let x = i32(id.x); let y = i32(id.y); let i = at(x,y);
  q[i] = 0.25 * (p[at(x-1,y)] + p[at(x+1,y)] + p[at(x,y-1)] + p[at(x,y+1)] - div[i]);
}
@compute @workgroup_size(${workgroup}, ${workgroup}) fn jacobiDirect(@builtin(global_invocation_id) id: vec3u) {
  let n = params.n;
  if (id.x >= n || id.y >= n) { return; }
  let i = id.y*n+id.x;
  let left = select(i-1u,i+n-1u,id.x==0u);
  let right = select(i+1u,i-n+1u,id.x+1u==n);
  let bottom = select(i-n,i+n*(n-1u),id.y==0u);
  let top = select(i+n,i-n*(n-1u),id.y+1u==n);
  q[i] = 0.25 * (p[left]+p[right]+p[bottom]+p[top]-div[i]);
}
// Two mathematically identical Jacobi iterations per dispatch. A two-cell halo
// makes the second iteration independent of neighbouring workgroups. All lanes
// reach both barriers, including lanes outside a partial edge workgroup.
var<workgroup> tileP: array<f32, ${(workgroup + 4) ** 2}>;
var<workgroup> tileD: array<f32, ${(workgroup + 4) ** 2}>;
var<workgroup> tileQ: array<f32, ${(workgroup + 4) ** 2}>;
@compute @workgroup_size(${workgroup}, ${workgroup}) fn jacobiPair(
  @builtin(local_invocation_id) local: vec3u,
  @builtin(local_invocation_index) lane: u32,
  @builtin(workgroup_id) group: vec3u
) {
  let base = vec2i(group.xy * ${workgroup}u) - vec2i(2);
  for (var k = lane; k < ${(workgroup + 4) ** 2}u; k += ${workgroup ** 2}u) {
    let x = i32(k % ${workgroup + 4}u); let y = i32(k / ${workgroup + 4}u);
    let i = at(base.x+x,base.y+y); tileP[k] = p[i]; tileD[k] = div[i];
  }
  workgroupBarrier();
  for (var k = lane; k < ${(workgroup + 4) ** 2}u; k += ${workgroup ** 2}u) {
    let x = k % ${workgroup + 4}u; let y = k / ${workgroup + 4}u;
    if (x > 0u && x < ${workgroup + 3}u && y > 0u && y < ${workgroup + 3}u) {
      tileQ[k] = 0.25 * (tileP[k-1u] + tileP[k+1u] + tileP[k-${workgroup + 4}u] + tileP[k+${workgroup + 4}u] - tileD[k]);
    }
  }
  workgroupBarrier();
  let id = group.xy * ${workgroup}u + local.xy;
  if (id.x < params.n && id.y < params.n) {
    let k = (local.y+2u) * ${workgroup + 4}u + local.x+2u;
    q[id.y*params.n+id.x] = 0.25 * (tileQ[k-1u] + tileQ[k+1u] + tileQ[k-${workgroup + 4}u] + tileQ[k+${workgroup + 4}u] - tileD[k]);
  }
}
@compute @workgroup_size(${workgroup}, ${workgroup}) fn project(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.n || id.y >= params.n) { return; }
  let x = i32(id.x); let y = i32(id.y); let i = at(x,y);
  dst[i] = vec4f(src[i].xy - vec2f(p[at(x+1,y)] - p[i], p[at(x,y+1)] - p[i]), src[i].zw);
}`;
const renderCode = `
struct Params { n: u32, dt: f32, pad: vec2f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> field: array<vec4f>;
@vertex fn vs(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
  var p = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[id],0,1);
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let x = min(u32(p.x),params.n-1); let y = min(u32(p.y),params.n-1);
  let d = clamp(field[y*params.n+x].z,0.0,1.0);
  return vec4f(d, d*d, sqrt(d), 1.0);
}`;

export async function createFluid(
  device,
  {
    size = 128,
    iterations = 40,
    workgroup = 8,
    dt = 1 / 60,
    format = 'rgba8unorm',
    pressureKernel = 'packed4-readonly',
    profileStages = false,
    fusePressureInit = pressureKernel.startsWith('packed'),
  } = {},
) {
  const initial = initialFluid(size);
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 1024 ||
    ![4, 8, 16].includes(workgroup) ||
    !Number.isFinite(dt) ||
    dt < 0 ||
    dt > 0.1 ||
    typeof fusePressureInit !== 'boolean' ||
    typeof profileStages !== 'boolean'
  )
    throw new RangeError('Invalid fluid parameters');
  if (
    ![
      'jacobi',
      'direct',
      'tiled-pair',
      'specialized',
      'temporal-4',
      'temporal-8',
      'packed4',
      'packed8',
      'packed4-wide',
      'packed4-strip',
      'packed4-readonly',
      'fft-jacobi',
    ].includes(pressureKernel)
  )
    throw new RangeError('Unknown pressure kernel');
  const useFFT = pressureKernel === 'fft-jacobi';
  if (useFFT && size & (size - 1))
    throw new RangeError('FFT pressure requires power-of-two dimensions');
  if (useFFT && fusePressureInit)
    throw new RangeError('FFT initializes pressure through its spectral filter');
  const requestedWidth =
    pressureKernel === 'packed8' ? 8 : pressureKernel.startsWith('packed4') ? 4 : 1;
  const vectorWidth = size % requestedWidth === 0 ? requestedWidth : 1;
  const pressureWorkgroup =
    vectorWidth > 1 && pressureKernel === 'packed4-wide'
      ? [32, 4]
      : vectorWidth > 1 &&
          ['packed4-strip', 'packed4-readonly', 'fft-jacobi'].includes(pressureKernel)
        ? [64, 1]
        : [workgroup, workgroup];
  const minimalPressureBindings = pressureKernel === 'packed4-readonly' && vectorWidth > 1;
  const temporalDepth = pressureKernel.startsWith('temporal-')
    ? Number(pressureKernel.slice(9))
    : 0;
  const remainingIterations = iterations - Number(fusePressureInit);
  const pressureDispatches = useFFT
    ? 6
    : temporalDepth
      ? Math.floor(remainingIterations / temporalDepth) + (remainingIterations % temporalDepth)
      : pressureKernel === 'tiled-pair'
        ? Math.ceil(remainingIterations / 2)
        : remainingIterations;
  const B = GPUBufferUsage,
    buffers = [];
  function buffer(bytes, usage, data) {
    const b = device.createBuffer({ size: bytes, usage, mappedAtCreation: !!data });
    if (data) {
      new Uint8Array(b.getMappedRange()).set(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
      b.unmap();
    }
    buffers.push(b);
    return b;
  }
  const uniformData = new ArrayBuffer(16);
  new Uint32Array(uniformData)[0] = size;
  new Float32Array(uniformData)[1] = dt;
  const uniform = buffer(16, B.UNIFORM, new Uint8Array(uniformData));
  const fieldA = buffer(initial.byteLength, B.STORAGE | B.COPY_SRC | B.COPY_DST, initial);
  const fieldB = buffer(initial.byteLength, B.STORAGE | B.COPY_SRC | B.COPY_DST);
  const pressure = [0, 1].map(() => buffer(size * size * 4, B.STORAGE | B.COPY_DST));
  const div = buffer(size * size * 4, B.STORAGE | B.COPY_SRC);
  const layout = device.createBindGroupLayout({
    entries: [0, 1, 2, 3, 4, 5].map((binding) => ({
      binding,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type:
          binding === 0
            ? 'uniform'
            : binding === 1 || binding === 3
              ? 'read-only-storage'
              : 'storage',
      },
    })),
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  let code = compute(workgroup) + (temporalDepth ? temporalPressure(workgroup, temporalDepth) : '');
  if (pressureKernel === 'specialized' || temporalDepth || useFFT)
    code = specializeGrid(code, size);
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  if (info.messages.some((x) => x.type === 'error'))
    throw new Error(info.messages.map((x) => x.message).join('\n'));
  const pipelines = {};
  const pressureEntries =
    useFFT || vectorWidth > 1
      ? []
      : temporalDepth
        ? [
            ...(remainingIterations >= temporalDepth ? ['jacobiTemporal'] : []),
            ...(remainingIterations % temporalDepth ? ['jacobiDirect'] : []),
          ]
        : pressureKernel === 'tiled-pair'
          ? ['jacobiPair', ...(remainingIterations % 2 ? ['jacobi'] : [])]
          : [pressureKernel === 'jacobi' ? 'jacobi' : 'jacobiDirect'];
  for (const entryPoint of [
    'advect',
    fusePressureInit ? 'divergenceInit' : 'divergence',
    ...pressureEntries,
    'project',
  ])
    pipelines[entryPoint] = await device.createComputePipelineAsync({
      layout: pipelineLayout,
      compute: { module, entryPoint },
    });
  if (vectorWidth > 1) {
    const packedModule = device.createShaderModule({
      code: packedPressure(pressureWorkgroup, vectorWidth, minimalPressureBindings),
    });
    pipelines.jacobiPacked = await device.createComputePipelineAsync({
      layout: minimalPressureBindings ? 'auto' : pipelineLayout,
      compute: { module: packedModule, entryPoint: 'jacobiPacked' },
    });
  }
  const group = (src, dst, p, q) =>
    device.createBindGroup({
      layout,
      entries: [uniform, src, dst, p, q, div].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
  const advectGroup = group(fieldA, fieldB, pressure[0], pressure[1]);
  const groups = [
    group(fieldB, fieldA, pressure[0], pressure[1]),
    group(fieldB, fieldA, pressure[1], pressure[0]),
  ];
  const pressureGroups = minimalPressureBindings
    ? [0, 1].map((i) =>
        device.createBindGroup({
          layout: pipelines.jacobiPacked.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniform } },
            { binding: 3, resource: { buffer: pressure[i] } },
            { binding: 4, resource: { buffer: pressure[1 - i] } },
            { binding: 5, resource: { buffer: div } },
          ],
        }),
      )
    : groups;
  const fft = useFFT
    ? await createFFTPressure(device, { size, iterations, divergence: div, pressure: pressure[0] })
    : null;
  const renderModule = device.createShaderModule({ code: renderCode });
  const renderPipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module: renderModule, entryPoint: 'vs' },
    fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const renderGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: { buffer: fieldA } },
    ],
  });
  const texture = device.createTexture({
    size: [size, size],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView(),
    dispatch = Math.ceil(size / workgroup);
  const queryCount = profileStages ? 10 : 4;
  const querySet = device.features.has('timestamp-query')
    ? device.createQuerySet({ type: 'timestamp', count: queryCount })
    : null;
  const timestampBuffer = querySet ? buffer(queryCount * 8, B.QUERY_RESOLVE | B.COPY_SRC) : null;
  const timestampRead = querySet ? buffer(queryCount * 8, B.COPY_DST | B.MAP_READ) : null;
  let steps = 0;
  async function read(buffer) {
    const out = device.createBuffer({ size: buffer.size, usage: B.COPY_DST | B.MAP_READ });
    try {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(buffer, 0, out, 0, buffer.size);
      device.queue.submit([encoder.finish()]);
      await out.mapAsync(GPUMapMode.READ);
      return new Float32Array(out.getMappedRange().slice(0));
    } finally {
      out.destroy();
    }
  }
  return {
    metadata: {
      size,
      iterations,
      pressureKernel,
      vectorWidth,
      pressureWorkgroup,
      fft: fft?.metadata ?? null,
      profileStages,
      fusePressureInit,
      workgroup: [workgroup, workgroup],
      dt,
      dispatchesPerStep: pressureDispatches + 3,
      gridCellUpdatesPerStep: size * size * (iterations + 3),
      workgroupStorageBytes: fft
        ? fft.metadata.workgroupStorageBytes
        : temporalDepth
          ? 12 * (workgroup + 2 * temporalDepth) ** 2
          : pressureKernel === 'tiled-pair'
            ? 12 * (workgroup + 4) ** 2
            : 0,
      gpuBufferBytes: buffers.reduce((s, b) => s + b.size, 0) + (fft?.metadata.bufferBytes ?? 0),
      gpuTextureBytes: size * size * 4,
      timestamps: !!querySet,
      boundary: 'periodic',
      solver: 'semi-Lagrangian advection, Jacobi pressure, backward divergence/forward gradient',
      updateCountNote:
        'Logical grid updates; tiled kernels additionally compute overlapping halo cells.',
    },
    reset(data = initial) {
      if (!(data instanceof Float32Array) || data.length !== initial.length)
        throw new Error('Invalid fluid state');
      device.queue.writeBuffer(fieldA, 0, data);
      steps = 0;
    },
    step() {
      const encoder = device.createCommandEncoder();
      if (!useFFT && !fusePressureInit) {
        encoder.clearBuffer(pressure[0]);
        encoder.clearBuffer(pressure[1]);
      }
      const begin = (index) =>
        encoder.beginComputePass(
          querySet
            ? {
                timestampWrites: {
                  querySet,
                  beginningOfPassWriteIndex: index,
                  endOfPassWriteIndex: index + 1,
                },
              }
            : {},
        );
      let pass = begin(0);
      const dispatchStage = (pipeline, bindings) => {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindings);
        pass.dispatchWorkgroups(dispatch, dispatch);
      };
      dispatchStage(pipelines.advect, advectGroup);
      if (profileStages) {
        pass.end();
        pass = begin(2);
      }
      dispatchStage(fusePressureInit ? pipelines.divergenceInit : pipelines.divergence, groups[0]);
      if (profileStages) {
        pass.end();
        pass = begin(4);
      }
      let pressureIndex = fusePressureInit ? 1 : 0;
      if (fft) {
        fft.encode(pass);
        pressureIndex = 0;
      } else if (vectorWidth > 1) {
        pass.setPipeline(pipelines.jacobiPacked);
        for (let k = 0; k < remainingIterations; k++) {
          pass.setBindGroup(0, pressureGroups[pressureIndex]);
          pass.dispatchWorkgroups(
            Math.ceil(size / (vectorWidth * pressureWorkgroup[0])),
            Math.ceil(size / pressureWorkgroup[1]),
          );
          pressureIndex = 1 - pressureIndex;
        }
      } else if (temporalDepth) {
        for (let k = 0; k < Math.floor(remainingIterations / temporalDepth); k++) {
          dispatchStage(pipelines.jacobiTemporal, groups[pressureIndex]);
          pressureIndex = 1 - pressureIndex;
        }
        for (let k = 0; k < remainingIterations % temporalDepth; k++) {
          dispatchStage(pipelines.jacobiDirect, groups[pressureIndex]);
          pressureIndex = 1 - pressureIndex;
        }
      } else if (pressureKernel === 'tiled-pair') {
        for (let k = 0; k < Math.floor(remainingIterations / 2); k++) {
          dispatchStage(pipelines.jacobiPair, groups[pressureIndex]);
          pressureIndex = 1 - pressureIndex;
        }
        if (remainingIterations % 2) {
          dispatchStage(pipelines.jacobi, groups[pressureIndex]);
          pressureIndex = 1 - pressureIndex;
        }
      } else
        for (let k = 0; k < remainingIterations; k++) {
          dispatchStage(
            pressureKernel === 'jacobi' ? pipelines.jacobi : pipelines.jacobiDirect,
            groups[pressureIndex],
          );
          pressureIndex = 1 - pressureIndex;
        }
      if (profileStages) {
        pass.end();
        pass = begin(6);
      }
      dispatchStage(pipelines.project, groups[pressureIndex]);
      pass.end();
      const render = encoder.beginRenderPass({
        ...(querySet
          ? {
              timestampWrites: {
                querySet,
                beginningOfPassWriteIndex: queryCount - 2,
                endOfPassWriteIndex: queryCount - 1,
              },
            }
          : {}),
        colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      });
      render.setPipeline(renderPipeline);
      render.setBindGroup(0, renderGroup);
      render.draw(3);
      render.end();
      if (querySet) encoder.resolveQuerySet(querySet, 0, queryCount, timestampBuffer, 0);
      device.queue.submit([encoder.finish()]);
      steps++;
    },
    readState: () => read(fieldA),
    readAdvected: () => read(fieldB),
    async timing() {
      if (!querySet) return null;
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(timestampBuffer, 0, timestampRead, 0, queryCount * 8);
      device.queue.submit([encoder.finish()]);
      await timestampRead.mapAsync(GPUMapMode.READ);
      const t = new BigUint64Array(timestampRead.getMappedRange()).slice();
      timestampRead.unmap();
      const durations = Array.from(
        { length: queryCount / 2 },
        (_, i) => Number(t[2 * i + 1] - t[2 * i]) / 1e6,
      );
      return {
        computeMs: durations.slice(0, -1).reduce((a, b) => a + b, 0),
        renderMs: durations.at(-1),
        ...(profileStages
          ? {
              stages: Object.fromEntries(
                ['advection', 'divergence', 'pressure', 'projection'].map((name, i) => [
                  name,
                  durations[i],
                ]),
              ),
            }
          : {}),
        scope: profileStages
          ? 'diagnostic split compute passes; pass boundaries add overhead'
          : 'last submitted simulation step; readback excluded from batch timing',
      };
    },
    async readPixels() {
      const bytesPerRow = Math.ceil((size * 4) / 256) * 256;
      const out = device.createBuffer({ size: bytesPerRow * size, usage: B.COPY_DST | B.MAP_READ });
      try {
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer({ texture }, { buffer: out, bytesPerRow }, [size, size]);
        device.queue.submit([encoder.finish()]);
        await out.mapAsync(GPUMapMode.READ);
        const raw = new Uint8Array(out.getMappedRange()),
          pixels = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++)
          pixels.set(raw.subarray(y * bytesPerRow, y * bytesPerRow + size * 4), y * size * 4);
        return pixels;
      } finally {
        out.destroy();
      }
    },
    get steps() {
      return steps;
    },
    dispose() {
      fft?.dispose();
      for (const b of buffers) b.destroy();
      texture.destroy();
      querySet?.destroy();
    },
  };
}
