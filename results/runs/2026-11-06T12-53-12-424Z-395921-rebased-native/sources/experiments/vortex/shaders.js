export function fluidCode(n,dt,viscosity,fused,workgroup=[4,4,4]) {
  const h=2*Math.PI/n;
  return `
@group(0) @binding(0) var<storage,read> src:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dst:array<vec4f>;
@group(0) @binding(2) var<storage,read> p:array<f32>;
@group(0) @binding(3) var<storage,read_write> div:array<f32>;
@group(0) @binding(4) var<storage,read_write> q:array<f32>;
fn at(v:vec3i)->u32 { let a=vec3u(v)&vec3u(${n-1}u);return (a.z*${n}u+a.y)*${n}u+a.x; }
fn sampleField(v:vec3f)->vec4f {
  // Derive weights from the exact integer cell used for lookup. A separately
  // lowered fract() can disagree at integer boundaries after contraction.
  let b=vec3i(floor(v));let f=clamp(v-vec3f(b),vec3f(0),vec3f(1));
  return mix(mix(mix(src[at(b)],src[at(b+vec3i(1,0,0))],f.x),mix(src[at(b+vec3i(0,1,0))],src[at(b+vec3i(1,1,0))],f.x),f.y),
    mix(mix(src[at(b+vec3i(0,0,1))],src[at(b+vec3i(1,0,1))],f.x),mix(src[at(b+vec3i(0,1,1))],src[at(b+vec3i(1,1,1))],f.x),f.y),f.z);
}
@compute @workgroup_size(${workgroup.join(",")}) fn advect(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);let value=src[i];
  let lap=src[at(v+vec3i(1,0,0))].xyz+src[at(v-vec3i(1,0,0))].xyz+src[at(v+vec3i(0,1,0))].xyz+src[at(v-vec3i(0,1,0))].xyz+src[at(v+vec3i(0,0,1))].xyz+src[at(v-vec3i(0,0,1))].xyz-6.0*value.xyz;
  let advected=sampleField(vec3f(id)-${dt/h}*value.xyz);
  dst[i]=vec4f(advected.xyz+${viscosity*dt/(h*h)}*lap,advected.w);
}
@compute @workgroup_size(${workgroup.join(",")}) fn divergence(@builtin(global_invocation_id) id:vec3u) {
  let v=vec3i(id);let i=at(v);
  let d=src[i].x-src[at(v-vec3i(1,0,0))].x+src[i].y-src[at(v-vec3i(0,1,0))].y+src[i].z-src[at(v-vec3i(0,0,1))].z;
  div[i]=d;${fused?'q[i]=-d/6.0;':''}
}
@compute @workgroup_size(${workgroup.join(",")}) fn project(@builtin(global_invocation_id) id:vec3u) {
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

export function tiledAdvectionCode(n,dt,viscosity) {
  const h=2*Math.PI/n;
  return `
var<workgroup> velocityTile:array<vec4f,600>;
fn interpolateTile(b:vec3i,f:vec3f)->vec4f {
  let k=u32((b.z*10+b.y)*10+b.x);
  return mix(mix(mix(velocityTile[k],velocityTile[k+1u],f.x),mix(velocityTile[k+10u],velocityTile[k+11u],f.x),f.y),
    mix(mix(velocityTile[k+100u],velocityTile[k+101u],f.x),mix(velocityTile[k+110u],velocityTile[k+111u],f.x),f.y),f.z);
}
@compute @workgroup_size(8,8,4) fn advectTile(@builtin(local_invocation_id) local:vec3u,@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u,@builtin(global_invocation_id) id:vec3u) {
  let origin=vec3i(group*vec3u(8,8,4));
  for(var t=lane;t<600u;t+=256u) {
    let offset=vec3i(i32(t%10u),i32((t/10u)%10u),i32(t/100u))-vec3i(1);
    velocityTile[t]=src[at(origin+offset)];
  }
  workgroupBarrier();
  let k=((local.z+1u)*10u+local.y+1u)*10u+local.x+1u;
  let value=velocityTile[k];
  let lap=velocityTile[k+1u].xyz+velocityTile[k-1u].xyz+velocityTile[k+10u].xyz+velocityTile[k-10u].xyz+velocityTile[k+100u].xyz+velocityTile[k-100u].xyz-6.0*value.xyz;
  // Keep the same global-coordinate rounding as the untiled implementation.
  let back=vec3f(id)-${dt/h}*value.xyz;
  let b=vec3i(floor(back));let f=clamp(back-vec3f(b),vec3f(0),vec3f(1));let relative=b-origin+vec3i(1);
  var advected:vec4f;
  if(all(relative>=vec3i(0))&&all(relative<vec3i(9,9,5))) {advected=interpolateTile(relative,f);}
  else {advected=sampleField(back);}
  dst[at(vec3i(id))]=vec4f(advected.xyz+${viscosity*dt/(h*h)}*lap,advected.w);
}`;
}
