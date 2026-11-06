// Frozen surface baseline from commit 65582131d3f61b51ad8fbf466efb8ec9d055e55e. MIT; ManimJS contributors and 3Blue1Brown LLC.

// src/surface/model.js
function validateSurfaceOptions({ uSegments = 512, vSegments = 256 } = {}) {
  if (!Number.isInteger(uSegments) || !Number.isInteger(vSegments) || uSegments < 3 || vSegments < 3 || uSegments > 2048 || vSegments > 2048) {
    throw new RangeError("Surface segments must be integers between 3 and 2048");
  }
  return { uSegments, vSegments, nu: uSegments + 1, nv: vSegments + 1 };
}
function surfaceIndices(nu, nv, tileSize = 0) {
  const indices = new Uint32Array((nu - 1) * (nv - 1) * 6);
  const tile = tileSize || Math.max(nu, nv);
  let k = 0;
  for (let ub = 0; ub < nu - 1; ub += tile)
    for (let vb = 0; vb < nv - 1; vb += tile)
      for (let u = ub; u < Math.min(ub + tile, nu - 1); u++)
        for (let v = vb; v < Math.min(vb + tile, nv - 1); v++) {
          const a = u * nv + v, b = a + nv, c = a + 1, d = b + 1;
          indices[k++] = a;
          indices[k++] = b;
          indices[k++] = c;
          indices[k++] = c;
          indices[k++] = b;
          indices[k++] = d;
        }
  return indices;
}
function surfaceBasis(count, axis) {
  const data = new Float32Array(count * 4);
  const frequency = axis === "u" ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const angle = 2 * Math.PI * i / (count - 1);
    data.set(
      [Math.cos(angle), Math.sin(angle), Math.sin(frequency * angle), Math.cos(frequency * angle)],
      4 * i
    );
  }
  return data;
}

// src/surface/shaders.js
function surfaceVertexShader(mode) {
  return `#version 300 es
precision highp float;
precision highp int;
uniform int nv;
uniform ivec2 shape;
uniform float phase;
uniform vec4 motion;
uniform vec2 spin;
uniform mat4 view;
uniform vec3 rescale;
uniform vec3 cameraPosition;
uniform vec3 lightPosition;
uniform highp sampler2D basisU;
uniform highp sampler2D basisV;
out vec4 vertexColor;
vec3 rotatePoint(vec3 p) {
  vec2 yz=mat2(${Math.cos(0.8)},${Math.sin(0.8)},${-Math.sin(0.8)},${Math.cos(0.8)})*p.yz;
  vec2 xy=mat2(spin.y,spin.x,-spin.x,spin.y)*vec2(p.x,yz.x);
  return vec3(xy,yz.y);
}
vec4 getU(int i) { return texelFetch(basisU,ivec2(clamp(i,0,shape.x-1),0),0); }
vec4 getV(int i) { return texelFetch(basisV,ivec2(clamp(i,0,shape.y-1),0),0); }
vec3 pointAt(ivec2 index) {
  index=clamp(index,ivec2(0),shape-1);
  ${mode === "direct" ? `
  float u=6.283185307179586*float(index.x)/float(shape.x-1);
  float v=6.283185307179586*float(index.y)/float(shape.y-1);
  float r=.62+.1*sin(6.*u+2.*v-phase);
  return rotatePoint(vec3((2.+r*cos(v))*cos(u),(2.+r*cos(v))*sin(u),r*sin(v)+.2*sin(3.*u+phase)));
  ` : `
  vec4 a=getU(index.x),b=getV(index.y);
  float s6=2.*a.z*a.w, c6=a.w*a.w-a.z*a.z;
  float sw=s6*b.w+c6*b.z, cw=c6*b.w-s6*b.z;
  float r=.62+.1*(sw*motion.y-cw*motion.x);
  return rotatePoint(vec3((2.+r*b.x)*a.x,(2.+r*b.x)*a.y,r*b.y+.2*(a.z*motion.y+a.w*motion.x)));
  `}
}
vec3 lit(vec3 color,vec3 p,vec3 normal) {
  vec3 toCamera=normalize(cameraPosition-p),toLight=normalize(lightPosition-p);
  float ln=dot(toLight,normal),lc=dot(reflect(-toLight,normal),toCamera);
  float bright=max(ln,0.)*.3+.2*exp(-3.*pow(1.-lc,2.));
  color=mix(color,vec3(1),bright);
  if(ln<0.) color=mix(color,vec3(0),max(-ln,0.)*.4);
  return color;
}
void main() {
  ivec2 rc=ivec2(gl_VertexID/nv,gl_VertexID%nv);
  vec3 p=pointAt(rc);
  vec3 du=pointAt(rc+ivec2(1,0))-pointAt(rc-ivec2(1,0));
  vec3 dv=pointAt(rc+ivec2(0,1))-pointAt(rc-ivec2(0,1));
  vec3 normal=normalize(cross(du,dv));
  vec3 scaled=(view*vec4(p,1)).xyz*rescale;
  float w=1.-scaled.z;
  // Convert WebGPU's [0,w] clip depth into OpenGL's [-w,w].
  gl_Position=vec4(scaled.xy,(1.-1.1*scaled.z)-w,w);
  vec3 color=vec3(.25+.3*(getU(rc.x).x+1.),.35+.15*(getV(rc.y).y+1.),.8);
  vertexColor=vec4(lit(color,p,normal),1);
}`;
}
var surfaceFragmentShader = `#version 300 es
precision highp float;
in vec4 vertexColor;
out vec4 outColor;
void main(){ outColor=vertexColor; }
`;

// src/surface/webgl2.js
function createSurfaceRenderer(canvas, options = {}) {
  const { nu, nv } = validateSurfaceOptions(options), mode = options.mode ?? "tiled";
  if (!["direct", "basis", "tiled"].includes(mode)) throw new RangeError("Unknown surface mode");
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true
  });
  if (!gl) throw new Error("WebGL2 unavailable");
  const width = canvas.width, height = canvas.height;
  if (width <= 0 || height <= 0) throw new RangeError("Expected a nonempty canvas");
  const shaders = [], textures = [], buffers = [];
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
      "nv",
      "shape",
      "phase",
      "motion",
      "spin",
      "view",
      "rescale",
      "cameraPosition",
      "lightPosition",
      "basisU",
      "basisV"
    ].map((n) => [n, gl.getUniformLocation(program, n)])
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const indices = surfaceIndices(nu, nv, mode === "tiled" ? 8 : 0), index = gl.createBuffer();
  buffers.push(index);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  for (const [axis, count, unit] of [
    ["u", nu, 0],
    ["v", nv, 1]
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
      surfaceBasis(count, axis)
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
    throw new Error("Incomplete surface framebuffer");
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.disable(gl.DITHER);
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const identity = new Float32Array([4 / 3, 0, 0, 0, 0, 4 / 3, 0, 0, 0, 0, 4 / 3, 0, 0, 0, 0, 1]);
  const focal = 3 / Math.tan(Math.PI / 8);
  const camera = options.camera ?? {
    view: Array.from(identity),
    frame_rescale_factors: [2 / (128 / 9), 0.25, 0.75 / focal],
    camera_position: [0, 0, focal],
    light_position: [-10, 10, 10]
  };
  gl.uniformMatrix4fv(uniform.view, false, camera.view);
  gl.uniform3fv(uniform.rescale, camera.frame_rescale_factors);
  gl.uniform3fv(uniform.cameraPosition, camera.camera_position);
  gl.uniform3fv(uniform.lightPosition, camera.light_position);
  const completionPixel = new Uint8Array(4);
  const indexCount = indices.length, indexBytes = indices.byteLength;
  let disposed = false;
  const check = () => {
    if (disposed) throw new Error("Surface disposed");
    if (canvas.width !== width || canvas.height !== height)
      throw new Error("Canvas resized: recreate the surface renderer");
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
      backend: "webgl2",
      gpuTimerAvailable: !!ext,
      renderer: gl.getParameter(gl.RENDERER)
    },
    draw(phase, { present = true, query = null } = {}) {
      check();
      if (!Number.isFinite(phase)) throw new RangeError("Expected finite phase");
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
          gl.NEAREST
        );
      }
    },
    createQuery: () => ext ? gl.createQuery() : null,
    readQuery(query) {
      if (!query) return null;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) throw new Error("Disjoint GPU timer");
      return gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 : null;
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
      const bottom = new Uint8Array(width * height * 4), top = new Uint8Array(bottom.length);
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
    }
  };
}
export {
  createSurfaceRenderer
};
