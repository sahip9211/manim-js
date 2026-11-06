// Low-order incompressible Taylor–Green stress fixture, not a DNS reference.
export function initialVortex(n) {
  const out=new Float32Array(n**3*4), h=2*Math.PI/n;
  for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const X=(x+.5)*h,Y=(y+.5)*h,Z=(z+.5)*h,i=((z*n+y)*n+x)*4;
    out[i]=Math.sin(X)*Math.cos(Y)*Math.cos(Z);
    out[i+1]=-Math.cos(X)*Math.sin(Y)*Math.cos(Z);
    out[i+3]=.5+.5*Math.sin(X)*Math.sin(Y)*Math.sin(Z);
  }
  return out;
}

export function metrics(field,n) {
  const h=2*Math.PI/n,at=(x,y,z)=>(((z+n)%n*n+(y+n)%n)*n+(x+n)%n)*4;
  let energy=0,enstrophy=0,div2=0,nonFinite=0,dyeMin=Infinity,dyeMax=-Infinity,dyeMass=0,speedMax=0;
  for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const i=at(x,y,z),xp=at(x+1,y,z),xm=at(x-1,y,z),yp=at(x,y+1,z),ym=at(x,y-1,z),zp=at(x,y,z+1),zm=at(x,y,z-1);
    for(let c=0;c<4;c++) if(!Number.isFinite(field[i+c]))nonFinite++;
    const v2=field[i]**2+field[i+1]**2+field[i+2]**2;
    energy+=v2/2;speedMax=Math.max(speedMax,Math.sqrt(v2));
    const d=(field[i]-field[xm]+field[i+1]-field[ym+1]+field[i+2]-field[zm+2])/h;div2+=d*d;
    const wx=(field[yp+2]-field[ym+2]-field[zp+1]+field[zm+1])/(2*h);
    const wy=(field[zp]-field[zm]-field[xp+2]+field[xm+2])/(2*h);
    const wz=(field[xp+1]-field[xm+1]-field[yp]+field[ym])/(2*h);
    enstrophy+=(wx*wx+wy*wy+wz*wz)/2;
    dyeMin=Math.min(dyeMin,field[i+3]);dyeMax=Math.max(dyeMax,field[i+3]);dyeMass+=field[i+3];
  }
  return {energy:energy/n**3,enstrophy:enstrophy/n**3,divergenceRms:Math.sqrt(div2/n**3),nonFinite,dyeMin,dyeMax,dyeMass:dyeMass/n**3,speedMax};
}

// Independent f64 CPU stencil, deliberately uses modulo rather than GPU masks.
export function cpuProjection(field,n,iterations) {
  const at=(x,y,z)=>((z+n)%n*n+(y+n)%n)*n+(x+n)%n;
  const div=new Float64Array(n**3);let p=new Float64Array(n**3),q=new Float64Array(n**3);
  for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const i=at(x,y,z);div[i]=field[4*i]-field[4*at(x-1,y,z)]+field[4*i+1]-field[4*at(x,y-1,z)+1]+field[4*i+2]-field[4*at(x,y,z-1)+2];
  }
  for(let k=0;k<iterations;k++) {
    for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
      const i=at(x,y,z);q[i]=(p[at(x-1,y,z)]+p[at(x+1,y,z)]+p[at(x,y-1,z)]+p[at(x,y+1,z)]+p[at(x,y,z-1)]+p[at(x,y,z+1)]-div[i])/6;
    }
    [p,q]=[q,p];
  }
  const out=new Float64Array(field);
  for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const i=at(x,y,z);out[4*i]-=p[at(x+1,y,z)]-p[i];out[4*i+1]-=p[at(x,y+1,z)]-p[i];out[4*i+2]-=p[at(x,y,z+1)]-p[i];
  }
  return out;
}

export function difference(a,b) {
  let maxAbsolute=0,error2=0,scale2=0;
  for(let i=0;i<a.length;i++) {const d=a[i]-b[i];maxAbsolute=Math.max(maxAbsolute,Math.abs(d));error2+=d*d;scale2+=b[i]*b[i];}
  return {maxAbsolute,relativeL2:Math.sqrt(error2/Math.max(scale2,1e-30))};
}

export function cpuAdvect(field,n,dt,viscosity) {
  const h=2*Math.PI/n,out=new Float64Array(field.length),at=(x,y,z)=>((((z%n+n)%n)*n+(y%n+n)%n)*n+(x%n+n)%n)*4;
  for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
    const i=at(x,y,z),back=[x-dt/h*field[i],y-dt/h*field[i+1],z-dt/h*field[i+2]],b=back.map(Math.floor),f=back.map((v,k)=>v-b[k]);
    for(let c=0;c<4;c++) {
      let value=0;
      for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)value+=field[at(b[0]+dx,b[1]+dy,b[2]+dz)+c]*(dx?f[0]:1-f[0])*(dy?f[1]:1-f[1])*(dz?f[2]:1-f[2]);
      if(c<3)value+=viscosity*dt/(h*h)*(field[at(x+1,y,z)+c]+field[at(x-1,y,z)+c]+field[at(x,y+1,z)+c]+field[at(x,y-1,z)+c]+field[at(x,y,z+1)+c]+field[at(x,y,z-1)+c]-6*field[i+c]);
      out[i+c]=value;
    }
  }
  return out;
}
