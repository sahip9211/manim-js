export function fluidCode(n,dt,viscosity,fused) {
  const h=2*Math.PI/n;
  return `
@group(0) @binding(0) var<storage,read> src:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(2) var<storage,read> p:array<f32>;
@group(0) @binding(3) var<storage,read_write> div:array<f32>;
@group(0) @binding(4) var<storage,read_write> q:array<f32>;
fn at(v:vec3i)->u32 { let a=vec3u(v)&vec3u(${n-1}u);return (a.z*${n}u+a.y)*${n}u+a.x; }
fn sampleField(v:vec3f)->vec4f {
  let b=vec3i(floor(v));let f=fract(v);
  return mix(mix(mix(src[at(b)],src[at(b+vec3i(1,0,0))],f.x),mix(src[at(b+vec3i(0,1,0))],src[at(b+vec3i(1,1,0))],f.x),f.y),
    mix(mix(src[at(b+vec3i(0,0,1))],src[at(b+vec3i(1,0,1))],f.x),mix(src[at(b+vec3i(0,1,1))],src[at(b+vec3i(1,1,1))],f.x),f.y),f.z);
}
@compute @workgroup_size(4,4,4) fn advect(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);let value=src[i];
  let lap=src[at(v+vec3i(1,0,0))].xyz+src[at(v-vec3i(1,0,0))].xyz+src[at(v+vec3i(0,1,0))].xyz+src[at(v-vec3i(0,1,0))].xyz+src[at(v+vec3i(0,0,1))].xyz+src[at(v-vec3i(0,0,1))].xyz-6.0*value.xyz;
  let advected=sampleField(vec3f(id)-${dt/h}*value.xyz);
  dst[i]=vec4f(advected.xyz+${viscosity*dt/(h*h)}*lap,advected.w);
}
@compute @workgroup_size(4,4,4) fn divergence(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);
  let d=src[i].x-src[at(v-vec3i(1,0,0))].x+src[i].y-src[at(v-vec3i(0,1,0))].y+src[i].z-src[at(v-vec3i(0,0,1))].z;
  div[i]=d;${fused?'q[i]=-d/6.0;':''}
}
@compute @workgroup_size(4,4,4) fn project(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);
  dst[i]=vec4f(src[i].xyz-vec3f(p[at(v+vec3i(1,0,0))],p[at(v+vec3i(0,1,0))],p[at(v+vec3i(0,0,1))])+vec3f(p[i]),src[i].w);
}`;
}

// Four adjacent x cells per invocation; minimal bindings, read-only divergence.
export function pressureCode(n) {return `
@group(0) @binding(0) var<storage,read> p:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> q:array<vec4f>;
@group(0) @binding(2) var<storage,read> div:array<vec4f>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) {
  if(id.x>=${n**3/4}u) {return;}
  let i=id.x;let x=i&${n/4-1}u;let y=(i/${n/4}u)&${n-1}u;let z=i/${n*n/4}u;
  let l=p[select(i-1u,i+${n/4-1}u,x==0u)];let r=p[select(i+1u,i-${n/4-1}u,x==${n/4-1}u)];let c=p[i];
  let ym=select(i-${n/4}u,i+${n*(n-1)/4}u,y==0u);let yp=select(i+${n/4}u,i-${n*(n-1)/4}u,y==${n-1}u);
  let zm=select(i-${n*n/4}u,i+${n*n*(n-1)/4}u,z==0u);let zp=select(i+${n*n/4}u,i-${n*n*(n-1)/4}u,z==${n-1}u);
  q[i]=(vec4f(l.w,c.xyz)+vec4f(c.yzw,r.x)+p[ym]+p[yp]+p[zm]+p[zp]-div[i])/6.0;
}`;}

export function renderCode(n,resolution,raySteps) {return `
@group(0) @binding(0) var<storage,read> field:array<vec4f>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
  let points=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(points[i],0,1);
}
@fragment fn fs(@builtin(position) pixel:vec4f)->@location(0) vec4f {
  let uv=(pixel.xy/${resolution}.0-.5)*1.4;var color=vec3f(0);var transmission=1.0;
  for(var k=0u;k<${raySteps}u;k++) {
    let z=(f32(k)+.5)/${raySteps}.0*1.4-.7;
    let pos=vec3f(.8525245*uv.x+.5226872*z,uv.y,-.5226872*uv.x+.8525245*z)+.5;
    if(all(pos>=vec3f(0)) && all(pos<vec3f(1))) {
      let cell=vec3u(pos*${n}.0);let v=field[(cell.z*${n}u+cell.y)*${n}u+cell.x];
      let density=length(v.xyz)*(.2+.8*v.w);let alpha=1.0-exp(-density*${5.6/raySteps});
      color+=transmission*alpha*(vec3f(.1,.25,.5)+.7*abs(v.xyz));transmission*=1.0-alpha;
    }
  }
  return vec4f(color+transmission*vec3f(.015,.02,.04),1);
}`;}
