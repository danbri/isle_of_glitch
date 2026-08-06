/* Body trajectories over time, straight from /frame, as an SVG. Shows WHO moved
 * and how far — which a screenshot of a moment cannot. Tracked by uid so slot
 * recycling cannot draw a line between two unrelated animals. */
const H='http://localhost:8899';
const SAMPLES=Number(Deno.args[0]??90), MS=Number(Deno.args[1]??1000);
const parse=(buf)=>{const dv=new DataView(buf);let at=48;
  const L=dv.getUint32(at,true);at+=4; at+=L*4;
  const pos=new Float32Array(buf,at,L*2);at+=L*8; at+=L*4; at+=L*4; at+=L*4;
  const uid=new Int32Array(buf,at,L);
  return {steps:dv.getUint32(8,true),bound:dv.getFloat32(12,true),L,pos,uid};};
const track=new Map(); let bound=100, steps0=null, steps1=null;
for(let s=0;s<SAMPLES;s++){
  const f=parse(await (await fetch(H+'/frame')).arrayBuffer());
  bound=f.bound; if(steps0===null) steps0=f.steps; steps1=f.steps;
  const acc=new Map();
  for(let k=0;k<f.L;k++){const u=f.uid[k];if(u<0)continue;
    let g=acc.get(u);if(!g){g=[0,0,0];acc.set(u,g);}
    g[0]+=f.pos[k*2];g[1]+=f.pos[k*2+1];g[2]++;}
  for(const [u,g] of acc){
    if(!track.has(u)) track.set(u,[]);
    track.get(u).push([g[0]/g[2],g[1]/g[2]]);
  }
  await new Promise(r=>setTimeout(r,MS));
}
// keep bodies present throughout, drop wrap jumps
const paths=[];
for(const [u,p] of track){
  if(p.length<SAMPLES*0.9) continue;
  let net=0, seg=[[]];
  for(let i=0;i<p.length;i++){
    if(i>0){ const d=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);
      if(d>bound*0.5){ seg.push([]); } }
    seg[seg.length-1].push(p[i]);
  }
  net=Math.hypot(p[p.length-1][0]-p[0][0],p[p.length-1][1]-p[0][1]);
  if(net>bound*0.5) net=0;
  paths.push({u,seg,net});
}
paths.sort((a,b)=>b.net-a.net);
const W=900,Hh=900,PAD=10;
const sx=(x)=>PAD+(x+bound)/(2*bound)*(W-2*PAD);
const sy=(y)=>PAD+(y+bound)/(2*bound)*(Hh-2*PAD);
const maxNet=Math.max(...paths.map(p=>p.net),1e-6);
let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}">`;
svg+=`<rect width="${W}" height="${Hh}" fill="#070c0b"/>`;
for(const p of paths){
  const t=Math.min(1,p.net/ (maxNet*0.35));
  const col = p.net<0.5 ? '#2b4a46' : `hsl(${(180-100*t).toFixed(0)} 80% ${(38+32*t).toFixed(0)}%)`;
  const wdt = p.net<0.5 ? 0.7 : (0.8+2.4*t).toFixed(2);
  for(const s of p.seg){
    if(s.length<2) continue;
    svg+=`<polyline fill="none" stroke="${col}" stroke-width="${wdt}" stroke-opacity="${p.net<0.5?0.5:0.95}" points="${s.map(q=>`${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`).join(' ')}"/>`;
  }
}
const secs=((steps1-steps0)*0.015).toFixed(0);
svg+=`<text x="14" y="${Hh-16}" fill="#7f9a95" font-family="ui-monospace,monospace" font-size="15">`+
     `${paths.length} bodies · ${secs}s of world time · brightest = furthest travelled</text>`;
svg+=`</svg>`;
await Deno.writeTextFile(Deno.args[2] ?? 'trails.svg', svg);
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(p*(s.length-1))];};
const nets=paths.map(p=>p.net);
console.log(`wrote ${Deno.args[2]??'trails.svg'} — ${paths.length} bodies, ${secs}s`);
console.log(`  net displacement p50 ${q(nets,.5).toFixed(2)} p90 ${q(nets,.9).toFixed(2)} max ${Math.max(...nets).toFixed(2)}`);
