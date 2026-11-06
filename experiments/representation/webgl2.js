import { parameters } from './model.js';

// Experiment-only backend. No engine dependency and no optional extensions.
export function createWebGL2Renderer(
  canvas,
  representation,
  { preserveDrawingBuffer = true } = {},
) {
  if (canvas.width !== representation.budget.width)
    throw new Error('Framebuffer width differs from geometry error budget');
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer,
  });
  if (!gl) throw new Error('WebGL2 unavailable');
  const shaders = [];
  function compile(type, source) {
    const shader = gl.createShader(type);
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(
    program,
    compile(
      gl.VERTEX_SHADER,
      `#version 300 es
precision highp float;
layout(location=0) in vec4 p; layout(location=1) in vec4 inst;
uniform vec4 params;
void main() {
  vec2 q = vec2(p.x + inst.x + p.z * params.y + p.w * params.x, p.y);
  if (inst.w > 0.5) q = vec2(p.x + inst.y * params.y + inst.z * params.x, inst.x);
  gl_Position = vec4(q * params.z, 0.0, 1.0);
}`,
    ),
  );
  gl.attachShader(
    program,
    compile(
      gl.FRAGMENT_SHADER,
      `#version 300 es
precision highp float; out vec4 color;
void main() { color = vec4(0.18, 0.78, 0.72, 1.0); }`,
    ),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  for (const s of shaders) gl.deleteShader(s);
  const location = gl.getUniformLocation(program, 'params'),
    uniforms = new Float32Array(4),
    buffers = [];
  const batches = representation.batches.map((b) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    for (const [i, data] of [b.vertices, b.instances].entries()) {
      const buffer = gl.createBuffer();
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 16, 0);
      gl.vertexAttribDivisor(i, i);
    }
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.indices, gl.STATIC_DRAW);
    return {
      vao,
      count: b.indices.length,
      instances: b.instances.length / 4,
      type: b.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
  });
  gl.bindVertexArray(null);
  gl.disable(gl.DITHER);
  gl.clearColor(0, 0, 0, 1);
  return {
    metadata: {
      ...representation.metadata,
      backend: 'webgl2',
      version: gl.getParameter(gl.VERSION),
      renderer: gl.getParameter(gl.RENDERER),
      antialias: false,
      preserveDrawingBuffer,
    },
    draw(phase, amplitude = 0.25) {
      if (gl.isContextLost()) throw new Error('WebGL2 context lost');
      parameters(phase, amplitude, representation, uniforms);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform4fv(location, uniforms);
      for (const b of batches) {
        gl.bindVertexArray(b.vao);
        gl.drawElementsInstanced(gl.LINES, b.count, b.type, 0, b.instances);
      }
    },
    readPixels() {
      const raw = new Uint8Array(canvas.width * canvas.height * 4),
        pixels = new Uint8Array(raw.length);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error}`);
      const stride = canvas.width * 4;
      for (let y = 0; y < canvas.height; y++)
        pixels.set(raw.subarray(y * stride, (y + 1) * stride), (canvas.height - y - 1) * stride);
      return pixels;
    },
    dispose() {
      for (const b of batches) gl.deleteVertexArray(b.vao);
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteProgram(program);
    },
  };
}
