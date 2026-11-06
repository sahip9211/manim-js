import { surfaceBasis, surfaceIndices, validateSurfaceOptions } from './model.js';
import { surfaceVertexShader, surfaceFragmentShader } from './shaders.js';

export function createSurfaceRenderer(canvas, options = {}) {
  const { nu, nv } = validateSurfaceOptions(options),
    mode = options.mode ?? 'tiled';
  if (!['direct', 'basis', 'tiled'].includes(mode)) throw new RangeError('Unknown surface mode');
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL2 unavailable');
  const width = canvas.width,
    height = canvas.height;
  if (width <= 0 || height <= 0) throw new RangeError('Expected a nonempty canvas');
  const shaders = [],
    textures = [],
    buffers = [];
  const compile = (type, source) => {
    const s = gl.createShader(type);
    shaders.push(s);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, surfaceVertexShader(mode)));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, surfaceFragmentShader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const uniform = Object.fromEntries(
    [
      'nv',
      'shape',
      'phase',
      'motion',
      'spin',
      'view',
      'rescale',
      'cameraPosition',
      'lightPosition',
      'basisU',
      'basisV',
    ].map((n) => [n, gl.getUniformLocation(program, n)]),
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const indices = surfaceIndices(nu, nv, mode === 'tiled' ? 8 : 0),
    index = gl.createBuffer();
  buffers.push(index);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  for (const [axis, count, unit] of [
    ['u', nu, 0],
    ['v', nv, 1],
  ]) {
    const texture = gl.createTexture();
    textures.push(texture);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      count,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      surfaceBasis(count, axis),
    );
  }
  gl.uniform1i(uniform.basisU, 0);
  gl.uniform1i(uniform.basisV, 1);
  gl.uniform1i(uniform.nv, nv);
  gl.uniform2i(uniform.shape, nu, nv);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const color = gl.createTexture();
  textures.push(color);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
    throw new Error('Incomplete surface framebuffer');
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.disable(gl.DITHER);
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const identity = new Float32Array([4 / 3, 0, 0, 0, 0, 4 / 3, 0, 0, 0, 0, 4 / 3, 0, 0, 0, 0, 1]);
  const focal = 3 / Math.tan(Math.PI / 8);
  const camera = options.camera ?? {
    view: Array.from(identity),
    frame_rescale_factors: [2 / (128 / 9), 0.25, 0.75 / focal],
    camera_position: [0, 0, focal],
    light_position: [-10, 10, 10],
  };
  gl.uniformMatrix4fv(uniform.view, false, camera.view);
  gl.uniform3fv(uniform.rescale, camera.frame_rescale_factors);
  gl.uniform3fv(uniform.cameraPosition, camera.camera_position);
  gl.uniform3fv(uniform.lightPosition, camera.light_position);
  const completionPixel = new Uint8Array(4);
  const indexCount = indices.length,
    indexBytes = indices.byteLength;
  let disposed = false;
  const check = () => {
    if (disposed) throw new Error('Surface disposed');
    if (canvas.width !== width || canvas.height !== height)
      throw new Error('Canvas resized: recreate the surface renderer');
  };
  return {
    gl,
    framebuffer,
    metadata: {
      mode,
      vertices: nu * nv,
      triangles: (nu - 1) * (nv - 1) * 2,
      indexBytes,
      gpuBufferBytes: indexBytes,
      gpuTextureBytes: (nu + nv) * 16 + width * height * 8,
      uploadBytesPerFrame: 32,
      backend: 'webgl2',
      gpuTimerAvailable: !!ext,
      renderer: gl.getParameter(gl.RENDERER),
    },
    draw(phase, { present = true, query = null } = {}) {
      check();
      if (!Number.isFinite(phase)) throw new RangeError('Expected finite phase');
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      gl.uniform1f(uniform.phase, phase);
      gl.uniform4f(uniform.motion, Math.sin(phase), Math.cos(phase), 0, 0);
      gl.uniform2f(uniform.spin, Math.sin(0.25 * phase), Math.cos(0.25 * phase));
      if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
      if (query) gl.endQuery(ext.TIME_ELAPSED_EXT);
      if (present) {
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(
          0,
          0,
          width,
          height,
          0,
          0,
          width,
          height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
      }
    },
    createQuery: () => (ext ? gl.createQuery() : null),
    readQuery(query) {
      if (!query) return null;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) throw new Error('Disjoint GPU timer');
      return gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
        ? gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
        : null;
    },
    deleteQuery(query) {
      if (query) gl.deleteQuery(query);
    },
    finish() {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, completionPixel);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`WebGL error ${error}`);
    },
    read() {
      check();
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      const bottom = new Uint8Array(width * height * 4),
        top = new Uint8Array(bottom.length);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottom);
      for (let y = 0; y < height; y++)
        top.set(bottom.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
      return top;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const b of buffers) gl.deleteBuffer(b);
      for (const t of textures) gl.deleteTexture(t);
      for (const s of shaders) gl.deleteShader(s);
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteRenderbuffer(depth);
    },
  };
}
