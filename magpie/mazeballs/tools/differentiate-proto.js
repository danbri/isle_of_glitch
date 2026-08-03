#!/usr/bin/env node
/* ============================ FINDINGS (this prototype) ============================
 * RUNG 3 (within-body cell differentiation) is NOT confirmed by two principled
 * attempts — an honest negative with a precise reason:
 *   - LINEAR trade-off (no per-pathway overhead): the A->B->energy windfall is
 *     captured by UNIFORM bodies without differentiating (a generalist cell doing
 *     0.5 of each step, consuming its own B, ties a specialist pair). LABOR-REG ≈
 *     LABOR-FIXED (~600 pop), within-body differentiation ~0.04 (noise). Recovers
 *     the textbook result: division of labour pays only under CONVEX returns to
 *     specialisation.
 *   - CONVEX trade-off (PATHCOST per active pathway): now REG beats FIXED on pop
 *     (382 vs 312) and ascent is strong (tournament late-vs-early 0.840) — BUT the
 *     mechanism is WRONG: bodies shrink to ~1.5 (overhead makes big bodies
 *     unaffordable) and within-body differentiation still does not rise (~0.02).
 *     REG wins by SINGLE-CELL PLASTICITY (a lone cell contextually switching
 *     pathways to dodge the double overhead), not by multicellular division of
 *     labour.
 * CONCLUSION: unlike rung 1 (multicellularity), which opened cleanly, rung 3 needs
 * a narrow regime this prototype didn't hit — bodies must stay CHEAP to maintain
 * AND the step-2 benefit must be strictly NON-cell-autonomous (a cell must be
 * unable to consume its own B; only a neighbour can) AND specialisation returns
 * must be convex — all at once, or evolution takes the easier single-cell plastic
 * route. Not every capability axis opens as easily as the first; the staircase is
 * real but its steps are not free. (rung 1 lives in tools/bodies-proto.js.)
 * ===================================================================================
 *
 * diff.js — RUNG 3 of the staircase: does within-body CELL DIFFERENTIATION open a
 * new hill above the multicellular one? Strictly lawful — differentiation is never
 * rewarded for its own sake (that would bake in the answer, the First-Law sin).
 * It is the MEANS to a chemical end:
 *   - a substrate A (light-fed field) is processed A -> B -> energy in TWO enzyme
 *     steps that TRADE OFF against a per-cell capacity budget (a cell can be good
 *     at step 1 OR step 2, not both);
 *   - the intermediate B diffuses & decays FAST, so it must be handed off between
 *     ADJACENT cells before it's lost -> the chain only completes inside a body;
 *   - a UNIFORM clone-blob (every cell doing the same step) can't complete it; a
 *     body whose cells DIFFERENTIATE (regulate their e1/e2 by local B) can.
 * CONDITIONS: LABOR-REG (cells regulate expression by local B — differentiation
 * possible) vs LABOR-FIXED (expression from genes only, no context — clonal bodies
 * stay uniform). Pre-registered success: REG monoculture ceiling > FIXED, AND
 * within-body expression diversity rises under selection.
 */
function rng(seed){ let s=(seed>>>0)||1; return ()=>(s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296; }
let R;
function gauss(){ let u=0,v=0; while(u===0)u=R(); while(v===0)v=R(); return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*v); }
const clamp=(v,a,b)=>v<a?a:v>b?b:v, fract=v=>v-Math.floor(v), sig=x=>1/(1+Math.exp(-x));
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

// genome: CTRNN + tag(3) + enz(3) + adhesion(1) + process genes p1,p2 (2)
const N=6,S=6,M=2,TG=3;
const oW=0,oB=oW+N*N,oT=oB+N,oI=oT+N,oO=oI+S*N,oTag=oO+N*M,oEnz=oTag+TG,oAdh=oEnz+TG,oP1=oAdh+1,oP2=oP1+1,GEN=oP2+1;
const CORE=0.013,REP=2.0,META=0.05,MOVECOST=0.25,THRUST=0.9,TURN=0.3,GRAZE=1.6,DIGEST=2.6,EAT_EFF=0.75,
      DIV_THRESH=4.0,DIV_FRAC=0.5,SENSE=0.05,LEAK=0.5,MAXC=1200;
const BOND_REST=CORE*1.15, SPRING=90, BOND_DAMP=25, BONDCOST=0.006;
// division-of-labor chemistry
const KREG=6.0,      // how strongly local B pushes a cell toward step-2 expression (REG only)
      P1RATE=3.2, P2RATE=3.2, YIELD_B=1.0, YIELD_E=2.4,  // A->B rate, B->energy rate, yields
      PATHCOST=0.09;  // fixed metabolic overhead per ACTIVE pathway (the convexity)
const _o=new Float32Array(N);
function randGenome(){ const g=new Float32Array(GEN); for(let i=0;i<GEN;i++) g[i]=gauss()*0.6; for(let i=oTag;i<oAdh;i++) g[i]=gauss()*0.5; return g; }
function mutate(g,rate){ const o=Float32Array.from(g); for(let i=0;i<GEN;i++) if(R()<0.3) o[i]+=gauss()*rate; return o; }
let CELL_ID=1;
function mkCell(x,y,g,fuel,lin,orig){ return { id:CELL_ID++, x:fract(x),y:fract(y),h:R()*6.283,vx:0,vy:0,g,y_:new Float32Array(N),fuel,lin,gen:0,orig:orig||0, comp:1, spec:0 }; }
function makeWorld(nS,reg){ const sources=[]; for(let i=0;i<nS;i++) sources.push({x:R(),y:R(),vx:(R()-.5)*.02,vy:(R()-.5)*.02});
  const asrc=[]; for(let i=0;i<3;i++) asrc.push({x:R(),y:R(),vx:(R()-.5)*.015,vy:(R()-.5)*.015});
  const w={ cells:[], sugar:mkField(), scent:mkField(), subA:mkField(), subB:mkField(), sources, asrc, bonds:[], nextLin:1, births:0, bodies:true, reg:!!reg };
  for(let i=0;i<GF*GF;i++) w.sugar.a[i]=0.4; return w; }

function step(w,sun,visc,mut){
  for(const s of w.sources){ s.x=fract(s.x+s.vx/60); s.y=fract(s.y+s.vy/60); if(R()<0.004){ s.vx=(R()-.5)*.02; s.vy=(R()-.5)*.02; } splat(w.sugar,s.x,s.y,sun/60*14); }
  for(const s of w.asrc){ s.x=fract(s.x+s.vx/60); s.y=fract(s.y+s.vy/60); if(R()<0.004){ s.vx=(R()-.5)*.015; s.vy=(R()-.5)*.015; } splat(w.subA,s.x,s.y,sun/60*22); }
  diffuse(w.sugar,0.10,0.03,5); diffuse(w.scent,0.18,0.06,5); diffuse(w.subA,0.07,0.02,9);
  diffuse(w.subB,0.24,0.10,6);   // B diffuses fast & decays fast -> hand-off must be LOCAL (within a body)

  const n=w.cells.length;
  const idIx=new Map(); for(let k=0;k<n;k++) idIx.set(w.cells[k].id,k);
  w.bonds=w.bonds.filter(b=>idIx.has(b.a)&&idIx.has(b.b));
  const par=new Int32Array(n); for(let k=0;k<n;k++) par[k]=k;
  const find=x=>{ while(par[x]!==x){ par[x]=par[par[x]]; x=par[x]; } return x; };
  const bondCount=new Int32Array(n);
  for(const b of w.bonds){ const ka=idIx.get(b.a),kb=idIx.get(b.b); bondCount[ka]++; bondCount[kb]++; const ra=find(ka),rb=find(kb); if(ra!==rb) par[ra]=rb; }
  const size=new Int32Array(n); for(let k=0;k<n;k++) size[find(k)]++;
  for(let k=0;k<n;k++) w.cells[k].comp=size[find(k)];

  const HN=32, hash=Array.from({length:HN*HN},()=>[]);
  for(let k=0;k<n;k++){ const c=w.cells[k]; hash[((fract(c.y)*HN)|0)*HN+((fract(c.x)*HN)|0)].push(k); }
  const born=[];
  for(let k=0;k<n;k++){ const c=w.cells[k]; if(!c) continue;
    const hl=c.h-0.6,hr=c.h+0.6, lx=c.x+Math.cos(hl)*SENSE,ly=c.y+Math.sin(hl)*SENSE, rx=c.x+Math.cos(hr)*SENSE,ry=c.y+Math.sin(hr)*SENSE;
    const sens=[ at(w.sugar,lx,ly)+at(w.scent,lx,ly)+at(w.subA,lx,ly), at(w.sugar,rx,ry)+at(w.scent,rx,ry)+at(w.subA,rx,ry), at(w.scent,lx,ly), at(w.scent,rx,ry), clamp(c.fuel/DIV_THRESH,0,1.5), 1 ];
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
    const su=at(w.sugar,c.x,c.y); if(su>0){ const tk=Math.min(su,GRAZE/60); splat(w.sugar,c.x,c.y,-tk); c.fuel+=tk; }
    // --- DIVISION OF LABOUR: express e1/e2 (budget-limited), run A->B and B->energy ---
    const bLoc=at(w.subB,c.x,c.y);
    let e1=sig(g[oP1] - (w.reg?KREG*bLoc:0));   // REG: suppress step-1 where B already high
    let e2=sig(g[oP2] + (w.reg?KREG*bLoc:0));   // REG: switch to step-2 where B is high
    const bud=e1+e2; if(bud>1){ e1/=bud; e2/=bud; }   // per-cell capacity budget: can't max both
    c.spec=e2-e1;   // specialisation readout for the differentiation metric
    const aLoc=at(w.subA,c.x,c.y);
    if(aLoc>0 && e1>0){ const r=Math.min(aLoc, P1RATE*e1/60); splat(w.subA,c.x,c.y,-r); splat(w.subB,c.x,c.y,r*YIELD_B); }
    if(bLoc>0 && e2>0){ const r=Math.min(bLoc, P2RATE*e2/60); splat(w.subB,c.x,c.y,-r); c.fuel+=r*YIELD_E; }
    // per-pathway fixed OVERHEAD (the convexity that makes specialisation pay): a
    // generalist keeping BOTH pathways active pays double; a specialist pays once.
    // Without this the trade-off is linear and division of labour is neutral.
    c.fuel-=PATHCOST*((e1>0.15?1:0)+(e2>0.15?1:0))/60;
    c.fuel-=BONDCOST*bondCount[k]/60;
    c.fuel-=(META+MOVECOST*thr*thr)/60;
    let tsm=0; for(let t=0;t<TG;t++) tsm+=Math.abs(c.g[oTag+t]); splat(w.scent,c.x,c.y, LEAK*clamp(tsm,0.2,2)/60);
    if(c.fuel>DIV_THRESH && w.cells.length+born.length<MAXC){ const a=R()*6.283,r=CORE*1.3;
      const ch=mkCell(c.x+Math.cos(a)*r,c.y+Math.sin(a)*r, mut>0?mutate(c.g,mut):c.g, c.fuel*DIV_FRAC, c.lin, c.orig); ch.gen=c.gen+1; born.push(ch); c.fuel*=(1-DIV_FRAC);
      const padh=clamp(0.5+0.5*Math.tanh(g[oAdh]),0,1); if(R()<padh) w.bonds.push({a:c.id,b:ch.id}); }
    if(c.fuel<=0) w.cells[k]=null;
  }
  // damped bond springs; bonds break only on death
  if(w.bonds.length){ const idIx2=new Map(); for(let k=0;k<w.cells.length;k++) if(w.cells[k]) idIx2.set(w.cells[k].id,k);
    for(const b of w.bonds){ const ka=idIx2.get(b.a),kb=idIx2.get(b.b); if(ka==null||kb==null) continue; const A=w.cells[ka],B=w.cells[kb];
      let dx=B.x-A.x,dy=B.y-A.y; if(dx>0.5)dx-=1;else if(dx<-0.5)dx+=1; if(dy>0.5)dy-=1;else if(dy<-0.5)dy+=1;
      const d=Math.hypot(dx,dy)||1e-6, ux=dx/d,uy=dy/d; const fs=SPRING*(d-BOND_REST); const rv=(B.vx-A.vx)*ux+(B.vy-A.vy)*uy;
      const F=(fs+BOND_DAMP*rv)/60; A.vx+=F*ux; A.vy+=F*uy; B.vx-=F*ux; B.vy-=F*uy; } }
  for(let k=0;k<w.cells.length;k++){ const c=w.cells[k]; if(c){ c.x=fract(c.x+c.vx); c.y=fract(c.y+c.vy); } }
  w.cells=w.cells.filter(Boolean);
  for(const b of born){ if(w.cells.length<MAXC){ w.cells.push(b); w.births++; } }
}
function meanComp(w){ if(!w.cells.length) return 1; let s=0; for(const c of w.cells) s+=c.comp; return s/w.cells.length; }
// within-body differentiation: mean over bodies (comp>=3) of the spread (max-min) of c.spec across body cells
function bodyDiff(w){ const grp=new Map(); const n=w.cells.length; const idIx=new Map(); for(let k=0;k<n;k++) idIx.set(w.cells[k].id,k);
  const par=new Int32Array(n); for(let k=0;k<n;k++) par[k]=k; const find=x=>{ while(par[x]!==x){ par[x]=par[par[x]]; x=par[x]; } return x; };
  for(const b of w.bonds){ if(!idIx.has(b.a)||!idIx.has(b.b))continue; const ra=find(idIx.get(b.a)),rb=find(idIx.get(b.b)); if(ra!==rb)par[ra]=rb; }
  for(let k=0;k<n;k++) find(k);
  const grpArr=new Map(); for(let k=0;k<n;k++){ const r=find(k); if(!grpArr.has(r))grpArr.set(r,[]); grpArr.get(r).push(w.cells[k].spec); }
  let acc=0,cnt=0; for(const arr of grpArr.values()){ if(arr.length<3) continue; let mn=1e9,mx=-1e9; for(const s of arr){ if(s<mn)mn=s; if(s>mx)mx=s; } acc+=(mx-mn); cnt++; }
  return cnt?acc/cnt:0; }
function evolve(steps,snapSteps,seed,reg){ R=rng(seed); const w=makeWorld(5,reg);
  for(let i=0;i<300;i++) w.cells.push(mkCell(R(),R(),randGenome(),1.6,w.nextLin++));
  const snaps=[]; for(let s=0;s<steps;s++){ step(w,1.4,0.86,0.12);
    if(s>0 && s%snapSteps===0 && w.cells.length>40) snaps.push({t:s,genomes:w.cells.map(c=>Float32Array.from(c.g)),comp:meanComp(w),diff:bodyDiff(w)});
    if(w.cells.length===0) w.cells.push(mkCell(R(),R(),randGenome(),1.6,w.nextLin++)); } return snaps; }
function monoculture(pool,seed,reg,window=1800,nEach=100){ R=rng(seed); const w=makeWorld(5,reg);
  for(let i=0;i<nEach;i++){ const g=pool[(R()*pool.length)|0]; w.cells.push(mkCell(R(),R(),Float32Array.from(g),1.8,i+1,0)); }
  let acc=0,cnt=0,dsum=0; for(let s=0;s<window;s++){ step(w,1.4,0.86,0); if(s>window*2/3){ acc+=w.cells.length; dsum+=bodyDiff(w); cnt++; } }
  return { pop: cnt?acc/cnt:0, diff: cnt?dsum/cnt:0 }; }
function tourney(a,b,seed,reg,window=1800,nEach=60){ R=rng(seed); const w=makeWorld(5,reg);
  const pick=(pool,orig)=>{ for(let i=0;i<nEach;i++){ const g=pool[(R()*pool.length)|0]; w.cells.push(mkCell(R(),R(),Float32Array.from(g),1.8,i+1,orig)); } };
  pick(a,1); pick(b,0); for(let s=0;s<window;s++) step(w,1.4,0.86,0);
  let later=0,tot=0; for(const c of w.cells){ tot++; if(c.orig===1)later++; } return tot?later/tot:0.5; }

function run(label,reg){ const snaps=evolve(20000,4000,20260803,reg); const TS=[11,22,33];
  console.log(`\n=== ${label} ===`);
  console.log('step   monoculture pop   body size   within-body differentiation(evo/mono)');
  for(const sn of snaps){ let p=0,d=0; for(const t of TS){ const m=monoculture(sn.genomes,t,reg); p+=m.pop; d+=m.diff; } p/=TS.length; d/=TS.length;
    console.log(`${String(sn.t).padStart(5)}     ${p.toFixed(1).padStart(7)}      ${sn.comp.toFixed(1).padStart(5)}        ${sn.diff.toFixed(3)} / ${d.toFixed(3)}`); }
  return snaps; }

console.log('RUNG 3 — does within-body CELL DIFFERENTIATION open a hill above multicellularity?');
console.log('(A->B->energy, two steps trading off a per-cell budget; B handed off only between adjacent cells)');
const reg=run('LABOR-REG   (cells regulate expression by local B — differentiation POSSIBLE)', true);
const fix=run('LABOR-FIXED (expression from genes only — clonal bodies stay UNIFORM)', false);
console.log('\n=== ascent tournament (REG world) ===');
const SEEDS=[101,202,303]; const tm=(a,b)=>{ let s=0; for(const sd of SEEDS) s+=tourney(a,b,sd,true); return s/SEEDS.length; };
const e=reg[0],l=reg[reg.length-1],mi=reg[(reg.length/2)|0];
console.log(`  late vs early: ${tm(l.genomes,e.genomes).toFixed(3)}   late vs mid: ${tm(l.genomes,mi.genomes).toFixed(3)}   control: ${tm(e.genomes,e.genomes).toFixed(3)}`);
console.log('\nreading (pre-registered): RUNG 3 confirmed if LABOR-REG monoculture pop ends ABOVE LABOR-FIXED');
console.log('AND within-body differentiation RISES over evolutionary time in REG (cells specialise). If REG~FIXED');
console.log('and differentiation stays ~0, the labour windfall did not select differentiation under this balance.');
