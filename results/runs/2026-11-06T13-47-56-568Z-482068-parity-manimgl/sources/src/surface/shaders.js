// Projection, finite-difference normals, and lighting follow ManimGL's surface
// shaders (MIT, Copyright (c) 2020-2026 3Blue1Brown LLC).
// See THIRD_PARTY_NOTICES.md for the complete upstream license.
export function surfaceVertexShader(mode) {
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
  ${
    mode === 'direct'
      ? `
  float u=6.283185307179586*float(index.x)/float(shape.x-1);
  float v=6.283185307179586*float(index.y)/float(shape.y-1);
  float r=.62+.1*sin(6.*u+2.*v-phase);
  return rotatePoint(vec3((2.+r*cos(v))*cos(u),(2.+r*cos(v))*sin(u),r*sin(v)+.2*sin(3.*u+phase)));
  `
      : `
  vec4 a=getU(index.x),b=getV(index.y);
  float s6=2.*a.z*a.w, c6=a.w*a.w-a.z*a.z;
  float sw=s6*b.w+c6*b.z, cw=c6*b.w-s6*b.z;
  float r=.62+.1*(sw*motion.y-cw*motion.x);
  return rotatePoint(vec3((2.+r*b.x)*a.x,(2.+r*b.x)*a.y,r*b.y+.2*(a.z*motion.y+a.w*motion.x)));
  `
  }
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

export const surfaceFragmentShader = `#version 300 es
precision highp float;
in vec4 vertexColor;
out vec4 outColor;
void main(){ outColor=vertexColor; }
`;
