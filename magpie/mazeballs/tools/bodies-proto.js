#!/usr/bin/env node
/* ============================ FINDINGS (this prototype) ============================
 * Ran CONTROL (single-cell soup) vs TREATMENT (division bonds + body-gated
 * tough-food windfall) vs SEEDED (adhesion started HIGH), each 24000 steps,
 * measured with the monoculture assay + mean body size + mean adhesion:
 *   - Bonds now physically hold (two bugs fixed: v1 spring 10x too weak vs thrust;
 *     v2 every new division-bond was discarded the same step because the child
 *     wasn't in `cells` yet during the force pass — retain such bonds instead).
 *   - BUT bodies never accumulate: mean connected-component size stays ~1.0-1.02
 *     in ALL conditions, even SEEDED where ~99% of divisions bond (adhesion 0.993,
 *     and it is NOT eroded -> high adhesion is ~neutral, neither strongly paying
 *     nor strongly costing).
 *   - So the tough-food windfall (needs comp>=5) is never captured; there is no
 *     pressure to grow bodies; small bodies are a stable equilibrium.
 * DIAGNOSIS: the blocker is not selection on adhesion, it is COMPONENT TURNOVER —
 * a simple parent<->child bond under a high-death single-cell lifecycle loses
 * links (to death and swim-stretch) as fast as it makes them, so components can't
 * grow to where the windfall pays. Crossing into multicellularity needs a
 * BODY-LEVEL lifecycle: much stronger cohesion, sibling bonds, AND reproduction
 * through a single-cell propagule so a body persists and reproduces AS a body
 * (the snowflake-yeast / single-cell-bottleneck design already in LAB-NOTES /
 * WORLD.md). That is the deferred laptop build; this prototype is where it starts.
 * ===================================================================================
 *
 * bodies.js — TEST the only lever the evidence leaves open: does cost-bearing
 * MULTICELLULARITY break the bounded foraging ceiling the monoculture assay
 * exposed? Strictly lawful — no roles, only cells/forces/fields + ONE heritable
 * adhesion gene:
 *   - division bonds: adhesion gene sets the chance a division keeps parent<->child
 *     bonded (a persistent spring). Bonded clusters = bodies (nothing is declared
 *     a "body"; they're just cells that stayed stuck).
 *   - a TOUGH-FOOD windfall (a 2nd light-fed field) a lone cell can't tap: harvest
 *     scales with your bonded connected-component size (collective digestion —
 *     "digesting needs ~N stomach cells"). Energy only a body can reach.
 *   - bonds cost metabolic upkeep.
 * CONTROL = current soup (no tough food, no bonds). TREATMENT = + bodies.
 * Measure both with the monoculture assay across evolutionary time: does
 * treatment's foraging ceiling keep RISING where control flatlines ~step 8000,
 * and do bodies actually get selected (mean component size rising)? */
function rng(seed){ let s=(seed>>>0)||1; return ()=>(s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296; }
let R;
function gauss(){ let u=0,v=0; while(u===0)u=R(); while(v===0)v=R(); return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*v); }
const clamp=(v,a,b)=>v<a?a:v>b?b:v, fract=v=>v-Math.floor(v);
const GF=64;
function mkField(){ return { a:new Float32Array(GF*GF), t:new Float32Array(GF*GF) }; }
function at(f,x,y){ const A=f.a,gx=fract(x)*GF,gy=fract(y)*GF; let ix=gx|0,iy=gy|0; const fx=gx-ix,fy=gy-iy;
  const ix1=ix+1===GF?0:ix+1, iy1=iy+1===GF?0:iy+1; const a=A[iy*GF+ix],b=A[iy*GF+ix1],c=A[iy1*GF+ix],d=A[iy1*GF+ix1];
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy; }
function splat(f,x,y,amt){ const A=f.a,gx=fract(x)*GF,gy=fract(y)*GF; let ix=gx|0,iy=gy|0; const fx=gx-ix,fy=gy-iy;
  const ix1=ix+1===GF?0:ix+1, iy1=iy+1===GF?0:iy+1;
  A[iy*GF+ix]+=amt*(1-fx)*(1-fy); A[iy*GF+ix1]+=amt*fx*(1-fy); A[iy1*GF+ix]+=amt*(1-fx)*fy; A[iy1*GF+ix1]+=amt*fx*fy; }
function diffuse(f,diff,decay,cap){ const A=f.a,T=f.t,keep=1-4*diff,dk=1-decay;
  for(let y=0;y<GF;y++){ const yu=(y===0?GF-1:y-1)*GF,yd=(y===GF-1?0:y+1)*GF,yc=y*GF;
    for(let x=0;x<GF;x++){ const xl=x===0?GF-1:x-1,xr=x===GF-1?0:x+1;
      let v=(keep*A[yc+x]+diff*(A[yc+xl]+A[yc+xr]+A[yu+x]+A[yd+x]))*dk; if(v>cap)v=cap; T[yc+x]=v; } } A.set(T); }

// genome: CTRNN + tag(3) + enz(3) + adhesion(1)
const N=6,S=6,M=2,TG=3;
const oW=0,oB=oW+N*N,oT=oB+N,oI=oT+N,oO=oI+S*N,oTag=oO+N*M,oEnz=oTag+TG,oAdh=oEnz+TG,GEN=oAdh+1;
const CORE=0.013,REP=2.0,META=0.05,MOVECOST=0.25,THRUST=0.9,TURN=0.3,GRAZE=1.6,DIGEST=2.6,EAT_EFF=0.75,
      DIV_THRESH=4.0,DIV_FRAC=0.5,SENSE=0.05,LEAK=0.5,MAXC=1200;
// multicellular constants
// bonds must be a STRONG constraint: a cell's own thrust adds ~0.015/frame to
// velocity, so a spring weaker than that lets bonded cells swim apart and snap
// instantly (v1 bug: SPRING=3.2 → bodies never held, comp stayed 1). Make the
// spring dominate thrust so clumps physically persist; selection can then act.
const BOND_REST=CORE*1.2, SPRING=90, BOND_BREAK=CORE*5.0, BONDCOST=0.006,
      TOUGHGRAZE=5.0, BODY_N=5;    // ~BODY_N bonded cells to fully tap tough food
const _o=new Float32Array(N);
function randGenome(){ const g=new Float32Array(GEN); for(let i=0;i<GEN;i++) g[i]=gauss()*0.6; for(let i=oTag;i<GEN;i++) g[i]=gauss()*0.5; return g; }
function mutate(g,rate){ const o=Float32Array.from(g); for(let i=0;i<GEN;i++) if(R()<0.3) o[i]+=gauss()*rate; return o; }
let CELL_ID=1;
function mkCell(x,y,g,fuel,lin,orig){ return { id:CELL_ID++, x:fract(x),y:fract(y),h:R()*6.283,vx:0,vy:0,g,y_:new Float32Array(N),fuel,lin,gen:0,orig:orig||0, comp:1 }; }
function makeWorld(nS,bodies){ const sources=[]; for(let i=0;i<nS;i++) sources.push({x:R(),y:R(),vx:(R()-.5)*.02,vy:(R()-.5)*.02});
  const tsrc=[]; if(bodies) for(let i=0;i<3;i++) tsrc.push({x:R(),y:R(),vx:(R()-.5)*.015,vy:(R()-.5)*.015});
  const w={ cells:[], sugar:mkField(), scent:mkField(), tough:mkField(), sources, tsrc, bonds:[], nextLin:1, births:0, bodies:!!bodies };
  for(let i=0;i<GF*GF;i++) w.sugar.a[i]=0.4; return w; }

function step(w,sun,visc,mut){
  for(const s of w.sources){ s.x=fract(s.x+s.vx/60); s.y=fract(s.y+s.vy/60); if(R()<0.004){ s.vx=(R()-.5)*.02; s.vy=(R()-.5)*.02; } splat(w.sugar,s.x,s.y,sun/60*14); }
  diffuse(w.sugar,0.10,0.03,5); diffuse(w.scent,0.18,0.06,5);
  if(w.bodies){ for(const s of w.tsrc){ s.x=fract(s.x+s.vx/60); s.y=fract(s.y+s.vy/60); if(R()<0.004){ s.vx=(R()-.5)*.015; s.vy=(R()-.5)*.015; } splat(w.tough,s.x,s.y,sun/60*22); } diffuse(w.tough,0.06,0.02,9); }

  const n=w.cells.length;
  // id -> index, prune dead bonds, union-find for component sizes
  const idIx=new Map(); for(let k=0;k<n;k++) idIx.set(w.cells[k].id,k);
  let bondCount=null;
  if(w.bodies){
    w.bonds=w.bonds.filter(b=>idIx.has(b.a)&&idIx.has(b.b));
    const par=new Int32Array(n); for(let k=0;k<n;k++) par[k]=k;
    const find=x=>{ while(par[x]!==x){ par[x]=par[par[x]]; x=par[x]; } return x; };
    bondCount=new Int32Array(n);
    for(const b of w.bonds){ const ka=idIx.get(b.a),kb=idIx.get(b.b); bondCount[ka]++; bondCount[kb]++; const ra=find(ka),rb=find(kb); if(ra!==rb) par[ra]=rb; }
    const size=new Int32Array(n); for(let k=0;k<n;k++) size[find(k)]++;
    for(let k=0;k<n;k++) w.cells[k].comp=size[find(k)];
  }

  const HN=32, hash=Array.from({length:HN*HN},()=>[]);
  for(let k=0;k<n;k++){ const c=w.cells[k]; hash[((fract(c.y)*HN)|0)*HN+((fract(c.x)*HN)|0)].push(k); }
  const born=[];
  for(let k=0;k<n;k++){ const c=w.cells[k]; if(!c) continue;
    const hl=c.h-0.6,hr=c.h+0.6, lx=c.x+Math.cos(hl)*SENSE,ly=c.y+Math.sin(hl)*SENSE, rx=c.x+Math.cos(hr)*SENSE,ry=c.y+Math.sin(hr)*SENSE;
    // sensors: food+smell L/R, tough-food L/R (0 in control), own fuel, bias
    const tl=w.bodies?at(w.tough,lx,ly):0, tr=w.bodies?at(w.tough,rx,ry):0;
    const sens=[ at(w.sugar,lx,ly)+at(w.scent,lx,ly)+tl, at(w.sugar,rx,ry)+at(w.scent,rx,ry)+tr, at(w.scent,lx,ly), at(w.scent,rx,ry), clamp(c.fuel/DIV_THRESH,0,1.5), 1 ];
    const g=c.g,yv=c.y_;
    for(let i=0;i<N;i++) _o[i]=Math.tanh(yv[i]+g[oB+i]);
    for(let i=0;i<N;i++){ let rec=0; for(let j=0;j<N;j++) rec+=_o[j]*g[oW+j*N+i]; let inp=0; for(let s2=0;s2<S;s2++) inp+=sens[s2]*g[oI+s2*N+i];
      const tauInv=1/(0.5+2*Math.abs(g[oT+i])+0.05); yv[i]+=(1/60)*20*tauInv*(-yv[i]+rec+inp); }
    let turn=0,thr=0; for(let i=0;i<N;i++){ const oi=Math.tanh(yv[i]+g[oB+i]); turn+=oi*g[oO+i*M]; thr+=oi*g[oO+i*M+1]; }
    turn=Math.tanh(turn)*TURN; thr=(Math.tanh(thr)*0.5+0.5)*THRUST;
    c.h+=turn; let fx=Math.cos(c.h)*thr, fy=Math.sin(c.h)*thr;
    const cx=(fract(c.x)*HN)|0, cy=(fract(c.y)*HN)|0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ const b=hash[(((cy+oy)%HN+HN)%HN)*HN+(((cx+ox)%HN+HN)%HN)];
      for(const j of b){ if(j===k)continue; const p=w.cells[j]; if(!p)continue; let dx=p.x-c.x,dy=p.y-c.y;
        if(dx>0.5)dx-=1;else if(dx<-0.5)dx+=1; if(dy>0.5)dy-=1;else if(dy<-0.5)dy+=1; const d2=dx*dx+dy*dy;
        if(d2<CORE*CORE&&d2>1e-9){ const d=Math.sqrt(d2); fx-=dx/d*REP*(CORE-d)/CORE; fy-=dy/d*REP*(CORE-d)/CORE;
          let m=0; for(let t=0;t<TG;t++) m+=g[oEnz+t]*p.g[oTag+t];
          if(m>0 && p.fuel>0){ const take=Math.min(p.fuel, m*DIGEST/60); p.fuel-=take; c.fuel+=take*EAT_EFF; } } } }
    c.vx=(c.vx+fx/60)*visc; c.vy=(c.vy+fy/60)*visc;
    // graze sugar; tap TOUGH food gated on body size; pay to live/move; pay bond upkeep
    const su=at(w.sugar,c.x,c.y); if(su>0){ const tk=Math.min(su,GRAZE/60); splat(w.sugar,c.x,c.y,-tk); c.fuel+=tk; }
    if(w.bodies){ const tf=at(w.tough,c.x,c.y);
      if(tf>0){ const bodyFactor=clamp((c.comp-1)/BODY_N,0,1); if(bodyFactor>0){ const tk=Math.min(tf, TOUGHGRAZE*bodyFactor/60); splat(w.tough,c.x,c.y,-tk); c.fuel+=tk; } }
      if(bondCount) c.fuel-=BONDCOST*bondCount[k]/60; }
    c.fuel-=(META+MOVECOST*thr*thr)/60;
    let tsm=0; for(let t=0;t<TG;t++) tsm+=Math.abs(c.g[oTag+t]); splat(w.scent,c.x,c.y, LEAK*clamp(tsm,0.2,2)/60);
    if(c.fuel>DIV_THRESH && w.cells.length+born.length<MAXC){ const a=R()*6.283,r=CORE*1.3;
      const ch=mkCell(c.x+Math.cos(a)*r,c.y+Math.sin(a)*r, mut>0?mutate(c.g,mut):c.g, c.fuel*DIV_FRAC, c.lin, c.orig); ch.gen=c.gen+1; born.push(ch); c.fuel*=(1-DIV_FRAC);
      // division bond: adhesion gene sets the chance parent<->child stay stuck
      if(w.bodies){ const padh=clamp(0.5+0.5*Math.tanh(g[oAdh]),0,1); if(R()<padh) w.bonds.push({a:c.id,b:ch.id}); }
    }
    if(c.fuel<=0) w.cells[k]=null;
  }
  // bond spring forces (attract along bonds beyond rest; break if overstretched)
  if(w.bodies && w.bonds.length){ const idIx2=new Map(); for(let k=0;k<w.cells.length;k++) if(w.cells[k]) idIx2.set(w.cells[k].id,k);
    const keep=[];
    for(const b of w.bonds){ const ka=idIx2.get(b.a),kb=idIx2.get(b.b);
      if(ka==null||kb==null){ keep.push(b); continue; }   // endpoint just BORN (not yet in cells) — retain the bond, don't drop it; next step it resolves
      const A=w.cells[ka],B=w.cells[kb];
      let dx=B.x-A.x,dy=B.y-A.y; if(dx>0.5)dx-=1;else if(dx<-0.5)dx+=1; if(dy>0.5)dy-=1;else if(dy<-0.5)dy+=1;
      const d=Math.hypot(dx,dy)||1e-6; if(d>BOND_BREAK) continue;  // snapped
      const f=SPRING*(d-BOND_REST)/d; const fxx=dx*f/60, fyy=dy*f/60;
      A.vx+=fxx; A.vy+=fyy; B.vx-=fxx; B.vy-=fyy; keep.push(b); }
    w.bonds=keep;
  }
  for(let k=0;k<w.cells.length;k++){ const c=w.cells[k]; if(c){ c.x=fract(c.x+c.vx); c.y=fract(c.y+c.vy); } }
  w.cells=w.cells.filter(Boolean);
  for(const b of born){ if(w.cells.length<MAXC){ w.cells.push(b); w.births++; } }
}
function meanComp(w){ if(!w.bodies||!w.cells.length) return 1; let s=0; for(const c of w.cells) s+=c.comp; return s/w.cells.length; }
function meanAdh(w){ if(!w.cells.length) return 0; let s=0; for(const c of w.cells) s+=clamp(0.5+0.5*Math.tanh(c.g[oAdh]),0,1); return s/w.cells.length; }
function evolve(steps,snapSteps,seed,bodies,initAdh){ R=rng(seed); const w=makeWorld(5,bodies);
  for(let i=0;i<300;i++){ const g=randGenome(); if(initAdh!=null) g[oAdh]=initAdh;   // SEED high adhesion so bodies exist from step 0 — tests whether selection KEEPS them (bodies pay) or erodes them (they don't)
    w.cells.push(mkCell(R(),R(),g,1.6,w.nextLin++)); }
  const snaps=[]; for(let s=0;s<steps;s++){ step(w,1.4,0.86,0.12);
    if(s>0 && s%snapSteps===0 && w.cells.length>40) snaps.push({t:s,genomes:w.cells.map(c=>Float32Array.from(c.g)),comp:meanComp(w),adh:meanAdh(w)});
    if(w.cells.length===0) w.cells.push(mkCell(R(),R(),randGenome(),1.6,w.nextLin++)); } return snaps; }
// monoculture: seed only this pool, neutral world mut=0, return mean pop over last third + mean body size
function monoculture(pool,seed,bodies,window=1800,nEach=100){ R=rng(seed); const w=makeWorld(5,bodies);
  for(let i=0;i<nEach;i++){ const g=pool[(R()*pool.length)|0]; w.cells.push(mkCell(R(),R(),Float32Array.from(g),1.8,i+1,0)); }
  let acc=0,cnt=0,csum=0; for(let s=0;s<window;s++){ step(w,1.4,0.86,0); if(s>window*2/3){ acc+=w.cells.length; csum+=meanComp(w)*w.cells.length; cnt++; } }
  return { pop: cnt?acc/cnt:0, comp: acc?csum/acc:1 }; }

function run(label,bodies,initAdh){
  const snaps=evolve(24000,3000,20260803,bodies,initAdh);
  const TS=[11,22,33];
  console.log(`\n=== ${label} ===`);
  console.log('step   monoculture pop (alone)   body size(evo/mono)   mean adhesion');
  for(const sn of snaps){ let p=0,c=0; for(const t of TS){ const m=monoculture(sn.genomes,t,bodies); p+=m.pop; c+=m.comp; } p/=TS.length; c/=TS.length;
    console.log(`${String(sn.t).padStart(5)}       ${p.toFixed(1).padStart(8)}           ${sn.comp.toFixed(2)} / ${c.toFixed(2)}          ${sn.adh.toFixed(3)}`); }
  return snaps;
}
console.log('Does cost-bearing multicellularity break the bounded foraging ceiling?');
console.log('(BODY_N='+BODY_N+' bonded cells to fully tap the tough-food windfall)');
run('CONTROL (single-cell soup — known bounded, flat after ~8000)', false);
run('TREATMENT (bonds+windfall, adhesion random start ~0.5)', true);
run('SEEDED (bonds+windfall, adhesion seeded HIGH — does selection KEEP it?)', true, 2.5);
console.log('\nreading: SEEDED tells whether the multicellular axis PAYS once present. If mean adhesion');
console.log('stays high and body size >1 with a monoculture pop above CONTROL, bodies pay -> the axis');
console.log('re-opens ascent. If adhesion erodes back toward ~0.5 and size -> 1, bodies do NOT pay under');
console.log('this windfall/cost balance (a real result: emergence needs a stronger group benefit).');
