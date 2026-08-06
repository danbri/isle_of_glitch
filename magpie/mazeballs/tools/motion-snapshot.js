/* A vector snapshot of the world from /frame: cells coloured by what they are.
 * Generated straight from the wire format, so it is the same data the viewer
 * draws and needs no browser, no GPU and no file plumbing. */
const H='http://localhost:8899';
const buf=await (await fetch(H+'/frame')).arrayBuffer();
const dv=new DataView(buf);
const steps=dv.getUint32(8,true), bound=dv.getFloat32(12,true);
const alive=dv.getUint32(16,true), gen=dv.getUint32(28,true);
let at=48;
const L=dv.getUint32(at,true);at+=4; at+=L*4;
const pos=new Float32Array(buf,at,L*2);at+=L*8;
const act=new Float32Array(buf,at,L);at+=L*4;
const type=new Int32Array(buf,at,L);at+=L*4;
at+=L*4; const uid=new Int32Array(buf,at,L); at+=L*4;
const pn=dv.getUint32(at,true); at+=4;
const pairs=new Int32Array(buf,at,pn);
// crop to a window so bodies are legible rather than dots
const CROP=Number(Deno.args[0]??40);
const W=1000;
const sx=(x)=>(x+CROP)/(2*CROP)*W, sy=(y)=>(y+CROP)/(2*CROP)*W;
const inside=(k)=>Math.abs(pos[k*2])<CROP&&Math.abs(pos[k*2+1])<CROP;
const COL=['#9aa7b4','#5fc9c0','#e08a4a','#b07fd0'];   // neuron sensor muscle anchor
const NAME=['neuron','sensor','muscle','anchor'];
let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W+46}" width="${W}" height="${W+46}">`;
svg+=`<rect width="${W}" height="${W+46}" fill="#070c0b"/>`;
// bonds first
let bl='';
const idx=new Map();
for(let k=0;k<L;k++) idx.set(k,k);
for(let i=0;i<pn;i+=2){
  const a=pairs[i],b=pairs[i+1];
  // pairs index arena slots; frame is live-cells-only, so skip if not visible
  if(a>=L||b>=L) continue;
  if(!inside(a)||!inside(b)) continue;
  const d=Math.hypot(pos[a*2]-pos[b*2],pos[a*2+1]-pos[b*2+1]);
  if(d>3) continue;
  bl+=`<line x1="${sx(pos[a*2]).toFixed(1)}" y1="${sy(pos[a*2+1]).toFixed(1)}" x2="${sx(pos[b*2]).toFixed(1)}" y2="${sy(pos[b*2+1]).toFixed(1)}"/>`;
}
svg+=`<g stroke="#24443f" stroke-width="0.8">${bl}</g>`;
const cens=[0,0,0,0];
for(let k=0;k<L;k++){
  const t=type[k]; if(t>=0&&t<4) cens[t]++;
  if(!inside(k)) continue;
  const a=Math.max(0,Math.min(1,(act[k]+1)/2));
  svg+=`<circle cx="${sx(pos[k*2]).toFixed(1)}" cy="${sy(pos[k*2+1]).toFixed(1)}" r="${(0.34/(2*CROP)*W).toFixed(2)}" fill="${COL[t]??'#444'}" fill-opacity="${(0.35+0.65*a).toFixed(2)}"/>`;
}
const tot=cens.reduce((x,y)=>x+y,0)||1;
let lx=14;
svg+=`<text x="14" y="${W+18}" fill="#7f9a95" font-family="ui-monospace,monospace" font-size="14">step ${steps.toLocaleString()} · gen ${gen} · ${alive} alive</text>`;
let leg='';
for(let t=0;t<4;t++){
  leg+=`<circle cx="${lx+5}" cy="${W+36}" r="5" fill="${COL[t]}"/><text x="${lx+15}" y="${W+40}" fill="#7f9a95" font-family="ui-monospace,monospace" font-size="13">${NAME[t]} ${(100*cens[t]/tot).toFixed(0)}%</text>`;
  lx+=150;
}
svg+=leg+`</svg>`;
await Deno.writeTextFile(Deno.args[1]??'world.svg',svg);
console.log(`wrote ${Deno.args[1]??'world.svg'} — step ${steps}, gen ${gen}, ${alive} alive`);
console.log(`census: ${NAME.map((n,t)=>`${n} ${(100*cens[t]/tot).toFixed(1)}%`).join('  ')}`);
