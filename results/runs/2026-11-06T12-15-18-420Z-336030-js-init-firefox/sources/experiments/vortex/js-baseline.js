// Frozen scalar initialization from experiment 006, for paired JS measurements.
export function initialVortexScalar(n) {
  const out=new Float32Array(n**3*4), h=2*Math.PI/n;
  for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const X=(x+.5)*h,Y=(y+.5)*h,Z=(z+.5)*h,i=((z*n+y)*n+x)*4;
    out[i]=Math.sin(X)*Math.cos(Y)*Math.cos(Z);
    out[i+1]=-Math.cos(X)*Math.sin(Y)*Math.cos(Z);
    out[i+3]=.5+.5*Math.sin(X)*Math.sin(Y)*Math.sin(Z);
  }
  return out;
}
