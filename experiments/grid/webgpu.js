import { cpuUpdates } from './model.js';

export const strategies = [
  'cpu-naive',
  'cpu-rows',
  'cpu-basis',
  'vertex',
  'basis',
  'procedural',
  'row-table',
  'compute',
  'compute-basis',
  'vertex-bundle',
];
const paramsWGSL = `
struct Params {
  phase: f32, amplitude: f32, scale: f32, size: f32,
  sinPhase: f32, cosPhase: f32, padding: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
fn deform(p: vec2f) -> vec2f {
  let angle = 3.0 * p.y + params.phase;
  // WGSL's sin accuracy guarantee is specified over [-pi, pi].
  let reduced = angle - 6.28318530718 * floor((angle + 3.14159265359) / 6.28318530718);
  return vec2f(p.x + params.amplitude * sin(reduced), p.y);
}`;

function vertexWGSL(strategy) {
  let input = '@location(0) p: vec2f';
  let position = 'p';
  let extra = '';
  if (strategy === 'vertex' || strategy === 'vertex-bundle') position = 'deform(p)';
  if (strategy === 'basis') {
    input = '@location(0) p: vec4f';
    position =
      'vec2f(p.x + params.amplitude * (p.z * params.cosPhase + p.w * params.sinPhase), p.y)';
  }
  if (strategy === 'procedural') {
    input = '@builtin(vertex_index) index: u32';
    position =
      'deform(vec2f(f32(index % u32(params.size)), f32(index / u32(params.size))) / (params.size - 1.0) * 2.0 - 1.0)';
  }
  if (strategy === 'row-table') {
    input += ', @builtin(vertex_index) index: u32';
    extra = '@group(0) @binding(1) var<storage, read> offsets: array<f32>;';
    position = 'vec2f(p.x + offsets[index / u32(params.size)], p.y)';
  }
  return `${paramsWGSL}
${extra}
@vertex fn vs(${input}) -> @builtin(position) vec4f {
  return vec4f((${position}) * params.scale, 0.0, 1.0);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(0.18, 0.78, 0.72, 1.0); }`;
}

const computeWGSL = (strategy) => `${paramsWGSL}
@group(0) @binding(1) var<storage, read> rest: array<${strategy === 'compute-basis' ? 'vec4f' : 'vec2f'}>;
@group(0) @binding(2) var<storage, read_write> positions: array<vec2f>;
@compute @workgroup_size(64) fn cs(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < u32(params.size * params.size)) {
    let p = rest[id.x];
    positions[id.x] = ${strategy === 'compute-basis' ? 'vec2f(p.x + params.amplitude * (p.z * params.cosPhase + p.w * params.sinPhase), p.y)' : 'deform(p)'};
  }
}`;

export async function createGridRenderer(
  device,
  grid,
  strategy,
  {
    width = 640,
    height = 480,
    timestampCapacity = 0,
    format = 'rgba8unorm',
    presentView = null,
  } = {},
) {
  if (!strategies.includes(strategy)) throw new Error(`Unknown strategy: ${strategy}`);
  const start = performance.now();
  const buffers = [];
  let bufferBytes = 0;
  const makeBuffer = (size, usage, data, label) => {
    const buffer = device.createBuffer({
      size: Math.ceil(size / 4) * 4,
      usage,
      mappedAtCreation: !!data,
      label,
    });
    if (data) {
      new Uint8Array(buffer.getMappedRange()).set(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
      buffer.unmap();
    }
    buffers.push(buffer);
    bufferBytes += buffer.size;
    return buffer;
  };
  const compile = async (code, label) => {
    const module = device.createShaderModule({ code, label });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length)
      throw new Error(errors.map((e) => `${label}:${e.lineNum}: ${e.message}`).join('\n'));
    return module;
  };
  const B = GPUBufferUsage;
  const uniforms = new Float32Array(8);
  const uniformBuffer = makeBuffer(32, B.UNIFORM | B.COPY_DST, null, 'parameters');
  const indexBuffer = makeBuffer(grid.indices.byteLength, B.INDEX, grid.indices, 'grid edges');
  let positionBuffer;
  if (strategy !== 'procedural') {
    const data = strategy === 'basis' ? grid.basis : grid.rest;
    positionBuffer = makeBuffer(
      data.byteLength,
      B.VERTEX | B.COPY_DST | B.COPY_SRC | (strategy.startsWith('compute') ? B.STORAGE : 0),
      data,
      'positions or basis',
    );
  }
  let offsetsBuffer, computePipeline, computeBindGroup;
  const offsets = strategy === 'row-table' ? new Float32Array(grid.size) : null;
  if (offsets)
    offsetsBuffer = makeBuffer(offsets.byteLength, B.STORAGE | B.COPY_DST, null, 'row offsets');
  const module = await compile(vertexWGSL(strategy), `grid/${strategy}`);
  const pipeline = await device.createRenderPipelineAsync({
    label: `grid/${strategy}`,
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers:
        strategy === 'procedural'
          ? []
          : [
              {
                arrayStride: strategy === 'basis' ? 16 : 8,
                attributes: [
                  {
                    shaderLocation: 0,
                    offset: 0,
                    format: strategy === 'basis' ? 'float32x4' : 'float32x2',
                  },
                ],
              },
            ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'line-list' },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      ...(offsetsBuffer ? [{ binding: 1, resource: { buffer: offsetsBuffer } }] : []),
    ],
  });
  if (strategy.startsWith('compute')) {
    const input = strategy === 'compute-basis' ? grid.basis : grid.rest;
    const restBuffer = makeBuffer(input.byteLength, B.STORAGE, input, 'compute input');
    const computeModule = await compile(computeWGSL(strategy), `grid/${strategy}`);
    computePipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'cs' },
    });
    computeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: restBuffer } },
        { binding: 2, resource: { buffer: positionBuffer } },
      ],
    });
  }
  const texture = presentView
    ? null
    : device.createTexture({
        size: [width, height],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
  const view = texture?.createView();
  const indexFormat = grid.indices.BYTES_PER_ELEMENT === 2 ? 'uint16' : 'uint32';
  function encodeDraw(pass) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    if (positionBuffer) pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, indexFormat);
    pass.drawIndexed(grid.indices.length);
  }
  let bundle;
  if (strategy === 'vertex-bundle') {
    const encoder = device.createRenderBundleEncoder({ colorFormats: [format] });
    encodeDraw(encoder);
    bundle = encoder.finish();
  }
  const bundles = bundle ? [bundle] : null;
  let querySet, resolveBuffer, readBuffer;
  if (timestampCapacity && device.features.has('timestamp-query')) {
    querySet = device.createQuerySet({ type: 'timestamp', count: timestampCapacity * 4 });
    resolveBuffer = makeBuffer(
      timestampCapacity * 32,
      B.QUERY_RESOLVE | B.COPY_SRC,
      null,
      'timestamp resolve',
    );
    readBuffer = makeBuffer(
      timestampCapacity * 32,
      B.COPY_DST | B.MAP_READ,
      null,
      'timestamp readback',
    );
  }
  const metrics = { updateMs: 0, uploadMs: 0, encodeMs: 0 };
  // Reuse descriptors. Command encoders and command buffers themselves are single-use.
  const attachment = { view, clearValue: [0.03, 0.05, 0.08, 1], loadOp: 'clear', storeOp: 'store' };
  const renderDescriptor = { colorAttachments: [attachment] };
  const computeDescriptor = {};
  const renderTimes = querySet
    ? { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 0 }
    : null;
  const computeTimes = querySet
    ? { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 0 }
    : null;
  const uploadBytes =
    32 + (cpuUpdates[strategy] ? grid.rest.byteLength : (offsets?.byteLength ?? 0));
  let destroyed = false;

  return {
    metadata: {
      strategy,
      size: grid.size,
      vertices: grid.count,
      segments: grid.indices.length / 2,
      width,
      height,
      bufferBytes,
      textureBytes: texture ? width * height * 4 : 0,
      uploadBytesPerFrame: uploadBytes,
      setupMs: performance.now() - start,
      timestamps: !!querySet,
    },
    draw(phase, amplitude = 0.25, timestampSlot = null) {
      if (destroyed) throw new Error('Renderer disposed');
      if (
        timestampSlot !== null &&
        (!Number.isInteger(timestampSlot) ||
          timestampSlot < 0 ||
          timestampSlot >= timestampCapacity)
      )
        throw new RangeError('Invalid timestamp slot');
      const t0 = performance.now();
      uniforms[0] = phase;
      uniforms[1] = amplitude;
      uniforms[2] = 0.65;
      uniforms[3] = grid.size;
      uniforms[4] = Math.sin(uniforms[0]);
      uniforms[5] = Math.cos(uniforms[0]);
      // Same f32 parameter values are used by CPU and GPU implementations.
      if (cpuUpdates[strategy]) cpuUpdates[strategy](grid, uniforms[0], uniforms[1]);
      if (offsets)
        for (let row = 0; row < grid.size; row++)
          offsets[row] =
            uniforms[1] * Math.sin(3 * grid.rest[row * grid.size * 2 + 1] + uniforms[0]);
      const t1 = performance.now();
      device.queue.writeBuffer(uniformBuffer, 0, uniforms);
      if (cpuUpdates[strategy]) device.queue.writeBuffer(positionBuffer, 0, grid.output);
      if (offsets) device.queue.writeBuffer(offsetsBuffer, 0, offsets);
      const t2 = performance.now();
      const encoder = device.createCommandEncoder();
      const timed = !!querySet && timestampSlot !== null;
      if (timed) {
        renderTimes.beginningOfPassWriteIndex = timestampSlot * 4 + 2;
        renderTimes.endOfPassWriteIndex = timestampSlot * 4 + 3;
        if (computeTimes) {
          computeTimes.beginningOfPassWriteIndex = timestampSlot * 4;
          computeTimes.endOfPassWriteIndex = timestampSlot * 4 + 1;
        }
      }
      if (computePipeline) {
        computeDescriptor.timestampWrites = timed ? computeTimes : undefined;
        const pass = encoder.beginComputePass(computeDescriptor);
        pass.setPipeline(computePipeline);
        pass.setBindGroup(0, computeBindGroup);
        pass.dispatchWorkgroups(Math.ceil(grid.count / 64));
        pass.end();
      }
      attachment.view = presentView ? presentView() : view;
      renderDescriptor.timestampWrites = timed ? renderTimes : undefined;
      const pass = encoder.beginRenderPass(renderDescriptor);
      if (bundles) pass.executeBundles(bundles);
      else encodeDraw(pass);
      pass.end();
      device.queue.submit([encoder.finish()]);
      const t3 = performance.now();
      metrics.updateMs = t1 - t0;
      metrics.uploadMs = t2 - t1;
      metrics.encodeMs = t3 - t2;
      return metrics;
    },
    async timestamps(count) {
      if (!querySet) return null;
      if (count < 1 || count > timestampCapacity) throw new RangeError('Invalid query count');
      const encoder = device.createCommandEncoder();
      encoder.resolveQuerySet(querySet, 0, count * 4, resolveBuffer, 0);
      encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, count * 32);
      device.queue.submit([encoder.finish()]);
      await readBuffer.mapAsync(GPUMapMode.READ, 0, count * 32);
      const values = new BigUint64Array(readBuffer.getMappedRange(0, count * 32));
      const samples = [];
      for (let i = 0; i < count; i++)
        samples.push({
          renderMs: Number(values[i * 4 + 3] - values[i * 4 + 2]) / 1e6,
          computeMs: computePipeline ? Number(values[i * 4 + 1] - values[i * 4]) / 1e6 : 0,
        });
      readBuffer.unmap();
      return samples;
    },
    async readPixels() {
      if (!texture) throw new Error('Pixel validation uses the offscreen target');
      const rowBytes = Math.ceil((width * 4) / 256) * 256;
      const readback = device.createBuffer({
        size: rowBytes * height,
        usage: B.COPY_DST | B.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: rowBytes }, [
        width,
        height,
      ]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const mapped = new Uint8Array(readback.getMappedRange());
      const packed = new Uint8Array(width * height * 4);
      for (let row = 0; row < height; row++)
        packed.set(mapped.subarray(row * rowBytes, row * rowBytes + width * 4), row * width * 4);
      readback.unmap();
      readback.destroy();
      return packed;
    },
    async readComputedPositions() {
      if (!computePipeline) throw new Error('Only compute produces a readable GPU position buffer');
      const readback = device.createBuffer({
        size: grid.rest.byteLength,
        usage: B.COPY_DST | B.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(positionBuffer, 0, readback, 0, grid.rest.byteLength);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(readback.getMappedRange()).slice();
      readback.unmap();
      readback.destroy();
      return values;
    },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      for (const buffer of buffers) buffer.destroy();
      texture?.destroy();
      querySet?.destroy();
    },
  };
}
