import { parameters } from './model.js';

const code = `
@group(0) @binding(0) var<uniform> params: vec4f;
@vertex fn vs(@location(0) p: vec4f, @location(1) inst: vec4f) -> @builtin(position) vec4f {
  var q = vec2f(p.x + inst.x + p.z * params.y + p.w * params.x, p.y);
  if (inst.w > 0.5) { q = vec2f(p.x + inst.y * params.y + inst.z * params.x, inst.x); }
  return vec4f(q * params.z, 0.0, 1.0);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(0.18, 0.78, 0.72, 1.0); }
`;

export async function createRepresentationRenderer(
  device,
  representation,
  { width = 640, height = 480, format = 'rgba8unorm', presentView } = {},
) {
  if (width !== representation.budget.width)
    throw new Error('Framebuffer width differs from geometry error budget');
  const module = device.createShaderModule({ code });
  const errors = (await module.getCompilationInfo()).messages.filter((x) => x.type === 'error');
  if (errors.length) throw new Error(errors.map((x) => x.message).join('\n'));
  const pipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [0, 1].map((i) => ({
        arrayStride: 16,
        stepMode: i ? 'instance' : 'vertex',
        attributes: [{ shaderLocation: i, offset: 0, format: 'float32x4' }],
      })),
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'line-list' },
  });
  const buffers = [];
  function buffer(data, usage) {
    const b = device.createBuffer({
      size: Math.ceil(data.byteLength / 4) * 4,
      usage,
      mappedAtCreation: true,
    });
    new Uint8Array(b.getMappedRange()).set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    b.unmap();
    buffers.push(b);
    return b;
  }
  const uniforms = new Float32Array(4);
  const uniformBuffer = buffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const group = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const batches = representation.batches.map((b) => ({
    vertices: buffer(b.vertices, GPUBufferUsage.VERTEX),
    instances: buffer(b.instances, GPUBufferUsage.VERTEX),
    indices: buffer(b.indices, GPUBufferUsage.INDEX),
    count: b.indices.length,
    instancesCount: b.instances.length / 4,
    indexFormat: b.indices instanceof Uint32Array ? 'uint32' : 'uint16',
  }));
  const texture = presentView
    ? null
    : device.createTexture({
        size: [width, height],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
  const view = texture?.createView();
  return {
    metadata: {
      ...representation.metadata,
      bufferAllocationBytes: buffers.reduce((s, b) => s + b.size, 0),
      backend: 'webgpu',
    },
    draw(phase, amplitude = 0.25) {
      parameters(phase, amplitude, representation, uniforms);
      device.queue.writeBuffer(uniformBuffer, 0, uniforms);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: presentView ? presentView() : view,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      for (const b of batches) {
        pass.setVertexBuffer(0, b.vertices);
        pass.setVertexBuffer(1, b.instances);
        pass.setIndexBuffer(b.indices, b.indexFormat);
        pass.drawIndexed(b.count, b.instancesCount);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
    async readPixels() {
      if (!texture) throw new Error('Readback requires offscreen target');
      const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
      const read = device.createBuffer({
        size: bytesPerRow * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      try {
        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer({ texture }, { buffer: read, bytesPerRow }, [width, height]);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const raw = new Uint8Array(read.getMappedRange()),
          pixels = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++)
          pixels.set(raw.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
        return pixels;
      } finally {
        read.destroy();
      }
    },
    dispose() {
      for (const b of buffers) b.destroy();
      texture?.destroy();
    },
  };
}
