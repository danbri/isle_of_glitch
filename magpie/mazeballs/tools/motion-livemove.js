/* Displacement in the LIVE world, tracked by uid so slot recycling cannot fake
 * it. Reports gross displacement AND the flow-drift baseline, because the field
 * pushes everything and drift is not locomotion. */
const H='http://localhost:8899';
const parse=(buf)=>{const dv=new DataView(buf);let at=48;
  const L=dv.getUint32(at,true);at+=4;
  const idx=new Int32Array(buf,at,L);at+=L*4;
  const pos=new Float32Array(buf,at,L*2);at+=L*8;
  const act=new Float32Array(buf,at,L);at+=L*4;
  const type=new Int32Array(buf,at,L);at+=L*4;
  at+=L*4; const uid=new Int32Array(buf,at,L);
  return {steps:dv.getUint32(8,true),bound:dv.getFloat32(12,true),L,pos,uid,type};};
const com=(f)=>{const m=new Map();
  for(let k=0;k<f.L;k++){const u=f.uid[k];if(u<0)continue;
    let g=m.get(u);if(!g){g=[0,0,0];m.set(u,g);}
    g[0]+=f.pos[k*2];g[1]+=f.pos[k*2+1];g[2]++;}
  for(const [u,g] of m){g[0]/=g[2];g[1]/=g[2];}
  return m;};
const a=parse(await (await fetch(H+'/frame')).arrayBuffer());
const A=com(a);
await new Promise(r=>setTimeout(r,60000));
const b=parse(await (await fetch(H+'/frame')).arrayBuffer());
const B=com(b);
const B_=b.bound;
const D=[];
for(const [u,p] of A){const q=B.get(u);if(!q)continue;
  let dx=q[0]-p[0],dy=q[1]-p[1];
  if(dx>B_)dx-=2*B_; if(dx<-B_)dx+=2*B_;
  if(dy>B_)dy-=2*B_; if(dy<-B_)dy+=2*B_;
  const d=Math.hypot(dx,dy); if(Number.isFinite(d)&&d<B_*0.5) D.push([d,dx,dy]);}
const q=(arr,p)=>{const s=[...arr].sort((x,y)=>x-y);return s[Math.floor(p*(s.length-1))];};
const ds=D.map(x=>x[0]);
const mx=D.reduce((s,x)=>s+x[1],0)/D.length, my=D.reduce((s,x)=>s+x[2],0)/D.length;
const drift=Math.hypot(mx,my);
console.log(`window: ${b.steps-a.steps} steps = ${((b.steps-a.steps)*0.015).toFixed(1)}s world time`);
console.log(`bodies tracked by uid: ${D.length}`);
console.log(`  displacement  p50 ${q(ds,.5).toFixed(3)}  p90 ${q(ds,.9).toFixed(3)}  max ${Math.max(...ds).toFixed(3)} world units`);
console.log(`  COMMON DRIFT (mean vector, i.e. the field carrying everyone): ${drift.toFixed(3)}`);
console.log(`  displacement RELATIVE to that drift:`);
const rel=D.map(x=>Math.hypot(x[1]-mx,x[2]-my));
console.log(`     p50 ${q(rel,.5).toFixed(3)}  p90 ${q(rel,.9).toFixed(3)}  max ${Math.max(...rel).toFixed(3)}`);
console.log(`  a body is ~4-6 units across, so p50 ${(q(rel,.5)/5).toFixed(3)} body-lengths in ${((b.steps-a.steps)*0.015).toFixed(0)}s`);
