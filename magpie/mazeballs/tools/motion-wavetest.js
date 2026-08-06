/* Can our ACTUAL bodies locomote if given a perfect gait? Drives muscles from an
 * imposed travelling wave instead of the brain. If they move, the body plan is
 * fine and the controller is the blocker. If they do not, no brain would help. */
const L='/Users/danbri/working/mazeballs/isle_of_glitch/magpie/mazeballs/lib/';
const d2=await import(L+'devo2.js'), d1=await import(L+'devo.js');
const { buildBodies }=await import(L+'bodies.js');
const { BrainArenaGPU }=await import(L+'brainarena_gpu.js');
const { WorldGPU }=await import(L+'world_gpu.js');
const { Evolver }=await import(L+'evolve.js');
const raw=JSON.parse(await Deno.readTextFile('live.json'));
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(p*(s.length-1))]:NaN;};
const f=(x,n=3)=>Number.isFinite(x)?x.toFixed(n):' -- ';

const byLin=new Map();
for(const r of raw.rows){const c=byLin.get(r.lineage); if(!c||r.generation>c.generation) byLin.set(r.lineage,r);}
let sd=4242; const rr=()=>{sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;};
const FRESH=Deno.args.includes('--fresh');
const picks=FRESH ? Array.from({length:30},()=>({g:Array.from(d2.randomGenome(rr))}))
                  : [...byLin.values()].slice(0,30);

async function run(wp,label){
  const N=picks.length, gap=48, side=Math.ceil(Math.sqrt(N)), bound=Math.max(60,side*gap/2);
  const built=buildBodies({beasts:N+8,cells:12,bound,seed:5,maxCells:60});
  const brains=await BrainArenaGPU.create(built.arena);
  const world=new WorldGPU(brains,built.cells,{bound,flowStr:0,nMotes:0,...wp});
  const evo=new Evolver({arena:built.arena,world,cells:built.cells,seed:2,
    birthEnergy:1e9,deathEnergy:-1e9,maxCells:60,devoVersion:2});
  for(let o=1;o<N+8;o++) evo.cull(o);
  evo.lastEnergy=new Float32Array(built.arena.P).fill(45);
  const born=[];
  for(let k=0;k<N;k++){
    evo.genome[0]=Float32Array.from(picks[k].g); evo.lastEnergy[0]=45;
    const gx=-bound+gap*(0.5+(k%side)), gy=-bound+gap*(0.5+Math.floor(k/side));
    const sv=evo.mutRate; evo.mutRate=0; const c=evo.divide(0,gx,gy,0); evo.mutRate=sv;
    if(c>=0) born.push(c);
  }
  evo.cull(0);
  const A=built.arena;
  const com=async()=>{const p=await world.readPositions();const m=new Map();
    for(const o of born){if(!A.alive[o])continue;let sx=0,sy=0;const c=A.cnt[o],of=A.off[o];
      for(let i=0;i<c;i++){sx+=p.x[of+i];sy+=p.y[of+i];} m.set(o,[sx/c,sy/c]);} return m;};
  world.step(1500);
  // Initial internal geometry, to detect a body coming apart rather than
  // locomoting — displacement from dismemberment is this project's classic
  // false positive and has been retracted before.
  const span=async()=>{const p=await world.readPositions();const m=new Map();
    for(const o of born){if(!A.alive[o])continue;const of=A.off[o],c=A.cnt[o];let mx=0;
      for(let i=0;i<c;i++)for(let j=i+1;j<c;j++){const d=Math.hypot(p.x[of+i]-p.x[of+j],p.y[of+i]-p.y[of+j]);if(d>mx)mx=d;}
      m.set(o,mx);} return m;};
  const sp0=await span();
  const c0=await com(); world.step(20000); const c1=await com();
  const sp1=await span();
  const blow=[];
  for(const [o,v] of sp0){const w=sp1.get(o); if(w&&v>1e-6) blow.push(w/v);}
  const D=[];
  for(const [o,p] of c0){const r=c1.get(o);if(!r)continue;
    const v=Math.hypot(r[0]-p[0],r[1]-p[1]); if(Number.isFinite(v)&&v<bound*0.5) D.push(v);}
  world.destroy(); brains.destroy();
  const torn=blow.filter(x=>x>2).length;
  console.log(`${label.padEnd(30)} n ${String(D.length).padStart(3)}  p50 ${f(q(D,.5)).padStart(7)}  p90 ${f(q(D,.9)).padStart(7)}  max ${f(Math.max(...D,0)).padStart(7)}  |  span x${f(q(blow,.5),2)} torn ${torn}/${blow.length}`);
  return q(D,.5);
}
console.log(FRESH ? 'FRESH FOUNDERS with a seeded axial connectome' : 'LIVE evolved genomes');
await run({}, 'brain-driven');
await run({contract:0}, 'CONTROL muscles off');
await run({waveAmp:1.0,waveOmega:9,waveK:6,wavePhase:3.1416}, 'imposed gait (ceiling)');
