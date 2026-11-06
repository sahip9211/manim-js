/*! ManimJS — experimental mathematical graphics.
MIT License

Copyright (c) 2026 ManimJS contributors
Copyright (c) 2020-2026 3Blue1Brown LLC (adapted surface shading and projection)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var z=Object.defineProperty;var $=(t,o)=>{for(var f in o)z(t,f,{get:o[f],enumerable:!0})};function U(t,o={}){let f=o.request??globalThis.requestAnimationFrame.bind(globalThis),r=o.cancel??globalThis.cancelAnimationFrame.bind(globalThis),a=null,e=!1,i=!1,s=!0,m=!1,u=()=>{!m&&s&&a===null&&(e||i)&&(a=f(n))},c=()=>{a!==null&&(r(a),a=null)};function n(p){a=null,!(m||!s)&&(e=!1,t(p),u())}return{invalidate(){m||(e=!0,u())},play(){m||(i=!0,u())},pause(){i=!1,e||c()},setVisible(p){m||(s=!!p,s?u():c())},dispose(){m=!0,i=!1,e=!1,c()},get playing(){return i}}}var H={};$(H,{createGrid:()=>C,createWaveTorus:()=>q});function I(t){if(!Number.isInteger(t)||t<2||t>2048)throw new RangeError("Grid size must be an integer in [2, 2048]");let o=t*t,f=new Float32Array(o*2),r=new Float32Array(o*4),a=new Float64Array(t),e=new Float64Array(t);for(let u=0;u<t;u++){let c=Math.fround(-1+2*u/(t-1));a[u]=Math.sin(3*c),e[u]=Math.cos(3*c);for(let n=0;n<t;n++){let p=u*t+n,d=Math.fround(-1+2*n/(t-1));f.set([d,c],p*2),r.set([d,c,a[u],e[u]],p*4)}}let i=o<=65536?Uint16Array:Uint32Array,s=new i(4*t*(t-1)),m=0;for(let u=0;u<t;u++)for(let c=0;c<t;c++){let n=u*t+c;c+1<t&&(s[m++]=n,s[m++]=n+1),u+1<t&&(s[m++]=n,s[m++]=n+t)}return{size:t,count:o,rest:f,basis:r,rowSin:a,rowCos:e,indices:s,output:new Float32Array(f.length)}}function j({width:t=640,scale:o=.65,amplitudeMax:f=.25,tolerance:r=.25}={}){if(![t,o,r].every(i=>Number.isFinite(i)&&i>0)||!Number.isFinite(f)||f<0)throw new RangeError("Invalid error budget");let a=t*o/2,e=Math.max(1,Math.ceil(Math.sqrt(9*f*a/(2*r))));if(e>65534)throw new RangeError("Error budget exceeds experiment index capacity");return{segments:e,boundPixels:9*f*a/(2*e**2),width:t,scale:o,amplitudeMax:f,tolerance:r}}function L(t,o,f={}){if(!Number.isInteger(t)||t<2||t>2048)throw new RangeError("Invalid grid size");if(!["expanded","instanced","bounded"].includes(o))throw new RangeError("Unknown representation");let r=j(f),a=o==="bounded"?r.segments:t-1,e;if(o==="expanded"){let i=I(t);e=[{vertices:i.basis,indices:i.indices,instances:new Float32Array(4)}]}else{let i=new Float32Array((a+1)*4),s=new Uint16Array(a*2);for(let c=0;c<=a;c++){let n=Math.fround(-1+2*c/a);i.set([0,n,Math.sin(3*n),Math.cos(3*n)],c*4),c<a&&s.set([c,c+1],c*2)}let m=new Float32Array(t*4),u=new Float32Array(t*4);for(let c=0;c<t;c++){let n=Math.fround(-1+2*c/(t-1));m.set([n,0,0,0],c*4),u.set([n,Math.sin(3*n),Math.cos(3*n),1],c*4)}e=[{vertices:i,indices:s,instances:m},{vertices:new Float32Array([-1,0,0,0,1,0,0,0]),indices:new Uint16Array([0,1]),instances:u}]}return{size:t,mode:o,segments:a,budget:r,batches:e,metadata:{drawCalls:e.length,segments:e.reduce((i,s)=>i+s.indices.length/2*s.instances.length/4,0),geometryBytes:e.reduce((i,s)=>i+s.vertices.byteLength+s.indices.byteLength+s.instances.byteLength,0),uploadBytesPerFrame:16,approximationBoundPixels:o==="bounded"?r.boundPixels:null,note:o==="instanced"?"Same polylines; collinear horizontal edges collapsed. Rasterization may differ at former endpoints.":o==="bounded"?"Bound against the analytic curve, not pixel equality with the original polyline.":"Original indexed grid with precomputed sine/cosine basis."}}}function P(t,o,f,r){if(!Number.isFinite(t)||!Number.isFinite(o)||Math.abs(o)>f.budget.amplitudeMax)throw new RangeError("Parameters exceed geometry error budget");return r[0]=o*Math.sin(t),r[1]=o*Math.cos(t),r[2]=f.budget.scale,r[3]=0,r}var K=`
@group(0) @binding(0) var<uniform> params: vec4f;
@vertex fn vs(@location(0) p: vec4f, @location(1) inst: vec4f) -> @builtin(position) vec4f {
  var q = vec2f(p.x + inst.x + p.z * params.y + p.w * params.x, p.y);
  if (inst.w > 0.5) { q = vec2f(p.x + inst.y * params.y + inst.z * params.x, inst.x); }
  return vec4f(q * params.z, 0.0, 1.0);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(0.18, 0.78, 0.72, 1.0); }
`;async function N(t,o,{width:f=640,height:r=480,format:a="rgba8unorm",presentView:e}={}){if(f!==o.budget.width)throw new Error("Framebuffer width differs from geometry error budget");let i=t.createShaderModule({code:K}),s=(await i.getCompilationInfo()).messages.filter(l=>l.type==="error");if(s.length)throw new Error(s.map(l=>l.message).join(`
`));let m=await t.createRenderPipelineAsync({layout:"auto",vertex:{module:i,entryPoint:"vs",buffers:[0,1].map(l=>({arrayStride:16,stepMode:l?"instance":"vertex",attributes:[{shaderLocation:l,offset:0,format:"float32x4"}]}))},fragment:{module:i,entryPoint:"fs",targets:[{format:a}]},primitive:{topology:"line-list"}}),u=[];function c(l,x){let w=t.createBuffer({size:Math.ceil(l.byteLength/4)*4,usage:x,mappedAtCreation:!0});return new Uint8Array(w.getMappedRange()).set(new Uint8Array(l.buffer,l.byteOffset,l.byteLength)),w.unmap(),u.push(w),w}let n=new Float32Array(4),p=c(n,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),d=t.createBindGroup({layout:m.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:p}}]}),E=o.batches.map(l=>({vertices:c(l.vertices,GPUBufferUsage.VERTEX),instances:c(l.instances,GPUBufferUsage.VERTEX),indices:c(l.indices,GPUBufferUsage.INDEX),count:l.indices.length,instancesCount:l.instances.length/4,indexFormat:l.indices instanceof Uint32Array?"uint32":"uint16"})),b=e?null:t.createTexture({size:[f,r],format:a,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),A=b?.createView();return{metadata:{...o.metadata,bufferAllocationBytes:u.reduce((l,x)=>l+x.size,0),backend:"webgpu"},draw(l,x=.25){P(l,x,o,n),t.queue.writeBuffer(p,0,n);let w=t.createCommandEncoder(),y=w.beginRenderPass({colorAttachments:[{view:e?e():A,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});y.setPipeline(m),y.setBindGroup(0,d);for(let g of E)y.setVertexBuffer(0,g.vertices),y.setVertexBuffer(1,g.instances),y.setIndexBuffer(g.indices,g.indexFormat),y.drawIndexed(g.count,g.instancesCount);y.end(),t.queue.submit([w.finish()])},async readPixels(){if(!b)throw new Error("Readback requires offscreen target");let l=Math.ceil(f*4/256)*256,x=t.createBuffer({size:l*r,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{let w=t.createCommandEncoder();w.copyTextureToBuffer({texture:b},{buffer:x,bytesPerRow:l},[f,r]),t.queue.submit([w.finish()]),await x.mapAsync(GPUMapMode.READ);let y=new Uint8Array(x.getMappedRange()),g=new Uint8Array(f*r*4);for(let v=0;v<r;v++)g.set(y.subarray(v*l,v*l+f*4),v*f*4);return g}finally{x.destroy()}},dispose(){for(let l of u)l.destroy();b?.destroy()}}}function D(t,o,{preserveDrawingBuffer:f=!0}={}){if(t.width!==o.budget.width)throw new Error("Framebuffer width differs from geometry error budget");let r=t.getContext("webgl2",{antialias:!1,alpha:!1,depth:!1,stencil:!1,preserveDrawingBuffer:f});if(!r)throw new Error("WebGL2 unavailable");let a=[];function e(n,p){let d=r.createShader(n);if(a.push(d),r.shaderSource(d,p),r.compileShader(d),!r.getShaderParameter(d,r.COMPILE_STATUS))throw new Error(r.getShaderInfoLog(d));return d}let i=r.createProgram();if(r.attachShader(i,e(r.VERTEX_SHADER,`#version 300 es
precision highp float;
layout(location=0) in vec4 p; layout(location=1) in vec4 inst;
uniform vec4 params;
void main() {
  vec2 q = vec2(p.x + inst.x + p.z * params.y + p.w * params.x, p.y);
  if (inst.w > 0.5) q = vec2(p.x + inst.y * params.y + inst.z * params.x, inst.x);
  gl_Position = vec4(q * params.z, 0.0, 1.0);
}`)),r.attachShader(i,e(r.FRAGMENT_SHADER,`#version 300 es
precision highp float; out vec4 color;
void main() { color = vec4(0.18, 0.78, 0.72, 1.0); }`)),r.linkProgram(i),!r.getProgramParameter(i,r.LINK_STATUS))throw new Error(r.getProgramInfoLog(i));for(let n of a)r.deleteShader(n);let s=r.getUniformLocation(i,"params"),m=new Float32Array(4),u=[],c=o.batches.map(n=>{let p=r.createVertexArray();r.bindVertexArray(p);for(let[E,b]of[n.vertices,n.instances].entries()){let A=r.createBuffer();u.push(A),r.bindBuffer(r.ARRAY_BUFFER,A),r.bufferData(r.ARRAY_BUFFER,b,r.STATIC_DRAW),r.enableVertexAttribArray(E),r.vertexAttribPointer(E,4,r.FLOAT,!1,16,0),r.vertexAttribDivisor(E,E)}let d=r.createBuffer();return u.push(d),r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,d),r.bufferData(r.ELEMENT_ARRAY_BUFFER,n.indices,r.STATIC_DRAW),{vao:p,count:n.indices.length,instances:n.instances.length/4,type:n.indices instanceof Uint32Array?r.UNSIGNED_INT:r.UNSIGNED_SHORT}});return r.bindVertexArray(null),r.disable(r.DITHER),r.clearColor(0,0,0,1),{metadata:{...o.metadata,backend:"webgl2",version:r.getParameter(r.VERSION),renderer:r.getParameter(r.RENDERER),antialias:!1,preserveDrawingBuffer:f},draw(n,p=.25){if(r.isContextLost())throw new Error("WebGL2 context lost");P(n,p,o,m),r.viewport(0,0,t.width,t.height),r.clear(r.COLOR_BUFFER_BIT),r.useProgram(i),r.uniform4fv(s,m);for(let d of c)r.bindVertexArray(d.vao),r.drawElementsInstanced(r.LINES,d.count,d.type,0,d.instances)},readPixels(){let n=new Uint8Array(t.width*t.height*4),p=new Uint8Array(n.length);r.readPixels(0,0,t.width,t.height,r.RGBA,r.UNSIGNED_BYTE,n);let d=r.getError();if(d!==r.NO_ERROR)throw new Error(`WebGL error ${d}`);let E=t.width*4;for(let b=0;b<t.height;b++)p.set(n.subarray(b*E,(b+1)*E),(t.height-b-1)*E);return p},dispose(){for(let n of c)r.deleteVertexArray(n.vao);for(let n of u)r.deleteBuffer(n);r.deleteProgram(i)}}}async function C(t,{backend:o="webgl2",size:f=128,tolerance:r=.25,amplitudeMax:a=.25,scale:e=.65}={}){if(!t||typeof t.getContext!="function"||t.width<=0||t.height<=0)throw new TypeError("Expected a nonempty canvas");if(!["webgl2","webgpu"].includes(o))throw new RangeError("Expected webgl2 or webgpu");let i=t.width,s=t.height,m=L(f,"bounded",{width:i,tolerance:r,amplitudeMax:a,scale:e}),u,c,n;try{if(o==="webgl2")u=D(t,m,{preserveDrawingBuffer:!1});else{let g=await globalThis.navigator?.gpu?.requestAdapter();if(!g)throw new Error("WebGPU unavailable; use WebGL2 on a fresh canvas");c=await g.requestDevice();let v=navigator.gpu.getPreferredCanvasFormat();if(u=await N(c,m,{width:i,height:s,format:v,presentView:()=>n.getCurrentTexture().createView()}),n=t.getContext("webgpu"),!n)throw new Error("Cannot create WebGPU context; canvas may already use another API");n.configure({device:c,format:v,alphaMode:"opaque"})}}catch(g){throw u?.dispose(),c?.destroy(),g}let p=.8,d=a,E,b=!1,A=!0,l=U(g=>{if(t.width!==i||t.height!==s)throw l.pause(),new Error("Canvas resized: dispose and recreate to recompute the pixel error budget");l.playing&&E!==void 0&&(p=(p+(g-E)/1e3)%(2*Math.PI)),E=g,u.draw(p,d)}),x=t.ownerDocument,w=()=>{E=void 0,l.setVisible(A&&!x?.hidden)};x?.addEventListener("visibilitychange",w);let y=typeof IntersectionObserver=="function"?new IntersectionObserver(g=>{A=g[0].isIntersecting,w()}):null;return y?.observe(t),w(),l.invalidate(),{metadata:{...u.metadata,experimental:!0,interpolationBoundPixels:m.budget.boundPixels},set(g){if(b)throw new Error("Grid disposed");let v=g.phase??p,F=g.amplitude??d;if(!Number.isFinite(v)||!Number.isFinite(F)||Math.abs(F)>a)throw new RangeError("Parameters exceed declared error budget");p=v,d=F,E=void 0,l.invalidate()},play(){E=void 0,l.play()},pause(){E=void 0,l.pause()},dispose(){b||(b=!0,l.dispose(),y?.disconnect(),x?.removeEventListener("visibilitychange",w),u.dispose(),n?.unconfigure(),c?.destroy())}}}function G({uSegments:t=512,vSegments:o=256}={}){if(!Number.isInteger(t)||!Number.isInteger(o)||t<3||o<3||t>2048||o>2048)throw new RangeError("Surface segments must be integers between 3 and 2048");return{uSegments:t,vSegments:o,nu:t+1,nv:o+1}}function O(t,o,f=0){let r=new Uint32Array((t-1)*(o-1)*6),a=f||Math.max(t,o),e=0;for(let i=0;i<t-1;i+=a)for(let s=0;s<o-1;s+=a)for(let m=i;m<Math.min(i+a,t-1);m++)for(let u=s;u<Math.min(s+a,o-1);u++){let c=m*o+u,n=c+o,p=c+1,d=n+1;r[e++]=c,r[e++]=n,r[e++]=p,r[e++]=p,r[e++]=n,r[e++]=d}return r}function V(t,o){let f=new Float32Array(t*4),r=o==="u"?3:2;for(let a=0;a<t;a++){let e=2*Math.PI*a/(t-1);f.set([Math.cos(e),Math.sin(e),Math.sin(r*e),Math.cos(r*e)],4*a)}return f}function X(t){return`#version 300 es
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
  vec2 yz=mat2(${Math.cos(.8)},${Math.sin(.8)},${-Math.sin(.8)},${Math.cos(.8)})*p.yz;
  vec2 xy=mat2(spin.y,spin.x,-spin.x,spin.y)*vec2(p.x,yz.x);
  return vec3(xy,yz.y);
}
vec4 getU(int i) { return texelFetch(basisU,ivec2(clamp(i,0,shape.x-1),0),0); }
vec4 getV(int i) { return texelFetch(basisV,ivec2(clamp(i,0,shape.y-1),0),0); }
vec3 pointAt(ivec2 index) {
  index=clamp(index,ivec2(0),shape-1);
  ${t==="direct"?`
  float u=6.283185307179586*float(index.x)/float(shape.x-1);
  float v=6.283185307179586*float(index.y)/float(shape.y-1);
  float r=.62+.1*sin(6.*u+2.*v-phase);
  return rotatePoint(vec3((2.+r*cos(v))*cos(u),(2.+r*cos(v))*sin(u),r*sin(v)+.2*sin(3.*u+phase)));
  `:`
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
}`}var W=`#version 300 es
precision highp float;
in vec4 vertexColor;
out vec4 outColor;
void main(){ outColor=vertexColor; }
`;function k(t,o={}){let{nu:f,nv:r}=G(o),a=o.mode??"tiled";if(!["direct","basis","tiled"].includes(a))throw new RangeError("Unknown surface mode");let e=t.getContext("webgl2",{antialias:!1,alpha:!1,preserveDrawingBuffer:!0});if(!e)throw new Error("WebGL2 unavailable");let i=t.width,s=t.height;if(i<=0||s<=0)throw new RangeError("Expected a nonempty canvas");let m=[],u=[],c=[],n=(h,T)=>{let R=e.createShader(h);if(m.push(R),e.shaderSource(R,T),e.compileShader(R),!e.getShaderParameter(R,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(R));return R},p=e.createProgram();if(e.attachShader(p,n(e.VERTEX_SHADER,X(a))),e.attachShader(p,n(e.FRAGMENT_SHADER,W)),e.linkProgram(p),!e.getProgramParameter(p,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(p));e.useProgram(p);let d=Object.fromEntries(["nv","shape","phase","motion","spin","view","rescale","cameraPosition","lightPosition","basisU","basisV"].map(h=>[h,e.getUniformLocation(p,h)])),E=e.createVertexArray();e.bindVertexArray(E);let b=O(f,r,a==="tiled"?8:0),A=e.createBuffer();c.push(A),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,A),e.bufferData(e.ELEMENT_ARRAY_BUFFER,b,e.STATIC_DRAW);for(let[h,T,R]of[["u",f,0],["v",r,1]]){let S=e.createTexture();u.push(S),e.activeTexture(e.TEXTURE0+R),e.bindTexture(e.TEXTURE_2D,S),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texImage2D(e.TEXTURE_2D,0,e.RGBA32F,T,1,0,e.RGBA,e.FLOAT,V(T,h))}e.uniform1i(d.basisU,0),e.uniform1i(d.basisV,1),e.uniform1i(d.nv,r),e.uniform2i(d.shape,f,r);let l=e.createFramebuffer();e.bindFramebuffer(e.FRAMEBUFFER,l);let x=e.createTexture();u.push(x),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,x),e.texStorage2D(e.TEXTURE_2D,1,e.RGBA8,i,s),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,x,0);let w=e.createRenderbuffer();if(e.bindRenderbuffer(e.RENDERBUFFER,w),e.renderbufferStorage(e.RENDERBUFFER,e.DEPTH24_STENCIL8,i,s),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.DEPTH_STENCIL_ATTACHMENT,e.RENDERBUFFER,w),e.checkFramebufferStatus(e.FRAMEBUFFER)!==e.FRAMEBUFFER_COMPLETE)throw new Error("Incomplete surface framebuffer");e.enable(e.DEPTH_TEST),e.depthFunc(e.LESS),e.disable(e.CULL_FACE),e.disable(e.BLEND),e.disable(e.DITHER);let y=e.getExtension("EXT_disjoint_timer_query_webgl2"),g=new Float32Array([4/3,0,0,0,0,4/3,0,0,0,0,4/3,0,0,0,0,1]),v=3/Math.tan(Math.PI/8),F=o.camera??{view:Array.from(g),frame_rescale_factors:[2/(128/9),.25,.75/v],camera_position:[0,0,v],light_position:[-10,10,10]};e.uniformMatrix4fv(d.view,!1,F.view),e.uniform3fv(d.rescale,F.frame_rescale_factors),e.uniform3fv(d.cameraPosition,F.camera_position),e.uniform3fv(d.lightPosition,F.light_position);let Y=new Uint8Array(4),Q=b.length,_=b.byteLength,M=!1,B=()=>{if(M)throw new Error("Surface disposed");if(t.width!==i||t.height!==s)throw new Error("Canvas resized: recreate the surface renderer")};return{gl:e,framebuffer:l,metadata:{mode:a,vertices:f*r,triangles:(f-1)*(r-1)*2,indexBytes:_,gpuBufferBytes:_,gpuTextureBytes:(f+r)*16+i*s*8,uploadBytesPerFrame:32,backend:"webgl2",gpuTimerAvailable:!!y,renderer:e.getParameter(e.RENDERER)},draw(h,{present:T=!0,query:R=null}={}){if(B(),!Number.isFinite(h))throw new RangeError("Expected finite phase");e.useProgram(p),e.bindVertexArray(E),e.bindFramebuffer(e.FRAMEBUFFER,l),e.viewport(0,0,i,s),e.uniform1f(d.phase,h),e.uniform4f(d.motion,Math.sin(h),Math.cos(h),0,0),e.uniform2f(d.spin,Math.sin(.25*h),Math.cos(.25*h)),R&&e.beginQuery(y.TIME_ELAPSED_EXT,R),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT|e.STENCIL_BUFFER_BIT),e.drawElements(e.TRIANGLES,Q,e.UNSIGNED_INT,0),R&&e.endQuery(y.TIME_ELAPSED_EXT),T&&(e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.blitFramebuffer(0,0,i,s,0,0,i,s,e.COLOR_BUFFER_BIT,e.NEAREST))},createQuery:()=>y?e.createQuery():null,readQuery(h){if(!h)return null;if(e.getParameter(y.GPU_DISJOINT_EXT))throw new Error("Disjoint GPU timer");return e.getQueryParameter(h,e.QUERY_RESULT_AVAILABLE)?e.getQueryParameter(h,e.QUERY_RESULT)/1e6:null},deleteQuery(h){h&&e.deleteQuery(h)},finish(){e.bindFramebuffer(e.READ_FRAMEBUFFER,l),e.readPixels(0,0,1,1,e.RGBA,e.UNSIGNED_BYTE,Y);let h=e.getError();if(h!==e.NO_ERROR)throw new Error(`WebGL error ${h}`)},read(){B(),e.bindFramebuffer(e.READ_FRAMEBUFFER,l);let h=new Uint8Array(i*s*4),T=new Uint8Array(h.length);e.readPixels(0,0,i,s,e.RGBA,e.UNSIGNED_BYTE,h);for(let R=0;R<s;R++)T.set(h.subarray(R*i*4,(R+1)*i*4),(s-1-R)*i*4);return T},dispose(){if(!M){M=!0;for(let h of c)e.deleteBuffer(h);for(let h of u)e.deleteTexture(h);for(let h of m)e.deleteShader(h);e.deleteProgram(p),e.deleteVertexArray(E),e.deleteFramebuffer(l),e.deleteRenderbuffer(w)}}}}async function q(t,o={}){let f=k(t,o),r=0,a,e=!1,i=!0,s=U(n=>{s.playing&&a!==void 0&&(r=(r+(n-a)/1e3)%(8*Math.PI)),a=n,f.draw(r)}),m=t.ownerDocument,u=()=>{a=void 0,s.setVisible(i&&!m?.hidden)},c=typeof IntersectionObserver=="function"?new IntersectionObserver(n=>{i=n[0].isIntersecting,u()}):null;return c?.observe(t),m?.addEventListener("visibilitychange",u),u(),s.invalidate(),{metadata:{...f.metadata,experimental:!0},set({phase:n}){if(e)throw new Error("Surface disposed");if(!Number.isFinite(n))throw new RangeError("Expected finite phase");r=n,a=void 0,s.invalidate()},render(n=r){if(e)throw new Error("Surface disposed");if(!Number.isFinite(n))throw new RangeError("Expected finite phase");r=n,a=void 0,f.draw(r)},play(){if(e)throw new Error("Surface disposed");a=void 0,s.play()},pause(){a=void 0,s.pause()},dispose(){e||(e=!0,s.dispose(),c?.disconnect(),m?.removeEventListener("visibilitychange",u),f.dispose())}}}export{U as createFrameLoop,H as experimental};
