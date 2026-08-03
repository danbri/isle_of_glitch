#!/usr/bin/env node
/**
 * soup-ascent.js — the LAWFUL one-soup arena, and a CATEGORY-FREE measure of ascent.
 *
 *   node tools/soup-ascent.js
 *
 * WHY THIS EXISTS (WORLD.md, THE FIRST LAW + Part IV). arena.html cheated: it
 * typed PREDATOR and PREY as first-class populations and scored them by role.
 * Forbidden — the universe supplies no entities, species, or chaser/chased tags.
 * Here there is ONE soup. Every cell is the same kind of thing:
 *   - a small CTRNN brain that reads sensors (food & others' smell) and drives a
 *     muscle (turn+thrust, costs fuel) — movement is the brain's decision;
 *   - a heritable TAG vector (its surface chemistry, which it also secretes as a
 *     smell) and a heritable ENZYME vector (what it can digest);
 *   - fuel, from light (a weak autotrophic base) and from CONSUMPTION.
 * Consumption is roleless and graded: on contact, cell A draws fuel from cell B
 * at rate max(0, A.enz · B.tag). "Predation" is just enzyme-meets-substrate — a
 * quantity of energy flow, never a label. A lineage whose enzymes match common
 * tags becomes an eater; one whose tag dodges common enzymes becomes hard to eat;
 * both evolve, a Red-Queen arms race in tag/enzyme space.
 *
 * WHAT IS COUNTED (the only category-free thing). Not "predator capability."
 * ASCENT = does a LATER gene pool beat an EARLIER one? Freeze the whole genome
 * pool at generation A and at generation B, drop a 50/50 mix into the SAME fresh
 * neutral world (mutation off, so we test the frozen genomes), let them eat,
 * breed and die, and read off which origin owns more of the population at the end.
 * Origin is a scoreboard label we keep OUTSIDE the cells — the cells never know
 * it; predation, foraging, defence all fold into "who captured more energy and
 * left more descendants." If later reliably beats earlier and does not plateau,
 * that is the strongest finite evidence of open-ended ascent there can be
 * (infinity itself is a horizon, not a state reachable in finite compute).
 */
function rng(seed){ let s=(seed>>>0)||1; return ()=>(s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296; }
let R = rng(20260803);
function gauss(){ let u=0,v=0; while(u===0)u=R(); while(v===0)v=R(); return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*v); }
const clamp=(v,a,b)=>v<a?a:v>b?b:v, fract=v=>v-Math.floor(v);

/* ---------------- fields (toroidal): sugar = light-energy, scent = smell ---------------- */
const GF=64;
function mkField(){ return { a:new Float32Array(GF*GF), t:new Float32Array(GF*GF) }; }
function at(f,x,y){ const A=f.a,gx=fract(x)*GF,gy=fract(y)*GF; let ix=gx|0,iy=gy|0; const fx=gx-ix,fy=gy-iy;
  const ix1=ix+1===GF?0:ix+1, iy1=iy+1===GF?0:iy+1;
  const a=A[iy*GF+ix],b=A[iy*GF+ix1],c=A[iy1*GF+ix],d=A[iy1*GF+ix1];
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy; }
function splat(f,x,y,amt){ const A=f.a,gx=fract(x)*GF,gy=fract(y)*GF; let ix=gx|0,iy=gy|0; const fx=gx-ix,fy=gy-iy;
  const ix1=ix+1===GF?0:ix+1, iy1=iy+1===GF?0:iy+1;
  A[iy*GF+ix]+=amt*(1-fx)*(1-fy); A[iy*GF+ix1]+=amt*fx*(1-fy); A[iy1*GF+ix]+=amt*(1-fx)*fy; A[iy1*GF+ix1]+=amt*fx*fy; }
function diffuse(f,diff,decay,cap){ const A=f.a,T=f.t,keep=1-4*diff,dk=1-decay;
  for(let y=0;y<GF;y++){ const yu=(y===0?GF-1:y-1)*GF,yd=(y===GF-1?0:y+1)*GF,yc=y*GF;
    for(let x=0;x<GF;x++){ const xl=x===0?GF-1:x-1,xr=x===GF-1?0:x+1;
      let v=(keep*A[yc+x]+diff*(A[yc+xl]+A[yc+xr]+A[yu+x]+A[yd+x]))*dk; if(v>cap)v=cap; T[yc+x]=v; } }
  A.set(T); }

/* ---------------- genome: CTRNN (N neurons, S sensors, M motors) + tag(TG) + enz(TG) ---------------- */
const N=6, S=6, M=2, TG=3;
const oW=0,oB=oW+N*N,oT=oB+N,oI=oT+N,oO=oI+S*N,oTag=oO+N*M,oEnz=oTag+TG,GEN=oEnz+TG;
function randGenome(){ const g=new Float32Array(GEN); for(let i=0;i<GEN;i++) g[i]=gauss()*0.6;
  // start tags/enzymes small & random
  for(let i=oTag;i<GEN;i++) g[i]=gauss()*0.5; return g; }
function mutate(g,rate){ const o=Float32Array.from(g); for(let i=0;i<GEN;i++) if(R()<0.3) o[i]+=gauss()*rate; return o; }

/* ---------------- cells ---------------- */
const CORE=0.013, REP=2.0, META=0.05, MOVECOST=0.25, THRUST=0.9, TURN=0.3,
      GRAZE=1.6, DIGEST=2.6, EAT_EFF=0.75, DIV_THRESH=4.0, DIV_FRAC=0.5, SENSE=0.05, LEAK=0.5, MAXC=1200;
function mkCell(x,y,g,fuel,lin,orig){ return { x:fract(x),y:fract(y),h:R()*6.283,vx:0,vy:0,g,
  y_:new Float32Array(N), fuel, lin, gen:0, orig:orig||0 }; }
const _o=new Float32Array(N);

/* one step of a world = {cells, sugar, scent, sources}. mut=0 freezes genomes (tournament). */
function makeWorld(nSources){ const sources=[]; for(let i=0;i<nSources;i++) sources.push({x:R(),y:R(),vx:(R()-.5)*.02,vy:(R()-.5)*.02});
  const w={ cells:[], sugar:mkField(), scent:mkField(), sources, nextLin:1, gen:0, births:0 };
  for(let i=0;i<GF*GF;i++) w.sugar.a[i]=0.4; return w; }
function step(w, sun, visc, mut){
  // fields: light in at drifting sources; smell diffuses
  for(const s of w.sources){ s.x=fract(s.x+s.vx/60); s.y=fract(s.y+s.vy/60);
    if(R()<0.004){ s.vx=(R()-.5)*.02; s.vy=(R()-.5)*.02; } splat(w.sugar,s.x,s.y,sun/60*14); }
  diffuse(w.sugar,0.10,0.03,5); diffuse(w.scent,0.18,0.06,5);
  // hash for neighbours
  const HN=32, hash=Array.from({length:HN*HN},()=>[]);
  for(let k=0;k<w.cells.length;k++){ const c=w.cells[k]; hash[((fract(c.y)*HN)|0)*HN+((fract(c.x)*HN)|0)].push(k); }
  const born=[];
  for(let k=0;k<w.cells.length;k++){
    const c=w.cells[k]; if(!c) continue;
    // SENSE (food & smell ahead-left/right, own fuel, bias)
    const hl=c.h-0.6,hr=c.h+0.6, lx=c.x+Math.cos(hl)*SENSE,ly=c.y+Math.sin(hl)*SENSE, rx=c.x+Math.cos(hr)*SENSE,ry=c.y+Math.sin(hr)*SENSE;
    const sens=[ at(w.sugar,lx,ly)+at(w.scent,lx,ly), at(w.sugar,rx,ry)+at(w.scent,rx,ry), at(w.scent,lx,ly), at(w.scent,rx,ry), clamp(c.fuel/DIV_THRESH,0,1.5), 1 ];
    // BRAIN (one CTRNN step)
    const g=c.g,yv=c.y_;
    for(let i=0;i<N;i++) _o[i]=Math.tanh(yv[i]+g[oB+i]);
    for(let i=0;i<N;i++){ let rec=0; for(let j=0;j<N;j++) rec+=_o[j]*g[oW+j*N+i]; let inp=0; for(let s2=0;s2<S;s2++) inp+=sens[s2]*g[oI+s2*N+i];
      const tauInv=1/(0.5+2*Math.abs(g[oT+i])+0.05); yv[i]+=(1/60)*20*tauInv*(-yv[i]+rec+inp); }
    let turn=0,thr=0; for(let i=0;i<N;i++){ const oi=Math.tanh(yv[i]+g[oB+i]); turn+=oi*g[oO+i*M]; thr+=oi*g[oO+i*M+1]; }
    turn=Math.tanh(turn)*TURN; thr=(Math.tanh(thr)*0.5+0.5)*THRUST;
    // MUSCLE + volume exclusion (physics) + CONSUMPTION (roleless enzyme·tag chemistry)
    c.h+=turn; let fx=Math.cos(c.h)*thr, fy=Math.sin(c.h)*thr;
    const cx=(fract(c.x)*HN)|0, cy=(fract(c.y)*HN)|0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ const b=hash[(((cy+oy)%HN+HN)%HN)*HN+(((cx+ox)%HN+HN)%HN)];
      for(const j of b){ if(j===k)continue; const p=w.cells[j]; if(!p)continue; let dx=p.x-c.x,dy=p.y-c.y;
        if(dx>0.5)dx-=1;else if(dx<-0.5)dx+=1; if(dy>0.5)dy-=1;else if(dy<-0.5)dy+=1; const d2=dx*dx+dy*dy;
        if(d2<CORE*CORE&&d2>1e-9){ const d=Math.sqrt(d2); fx-=dx/d*REP*(CORE-d)/CORE; fy-=dy/d*REP*(CORE-d)/CORE;
          // digestion: A draws fuel from B at rate max(0, A.enz · B.tag) — graded, no roles
          let m=0; for(let t=0;t<TG;t++) m+=g[oEnz+t]*p.g[oTag+t];
          if(m>0 && p.fuel>0){ const take=Math.min(p.fuel, m*DIGEST/60); p.fuel-=take; c.fuel+=take*EAT_EFF; } } } }
    c.vx=(c.vx+fx/60)*visc; c.vy=(c.vy+fy/60)*visc; c.x=fract(c.x+c.vx); c.y=fract(c.y+c.vy);
    // METABOLISM: graze sugar (autotrophic base), pay to live and move; SECRETE tag as smell
    const su=at(w.sugar,c.x,c.y); if(su>0){ const tk=Math.min(su,GRAZE/60); splat(w.sugar,c.x,c.y,-tk); c.fuel+=tk; }
    c.fuel-=(META+MOVECOST*thr*thr)/60;
    let tsm=0; for(let t=0;t<TG;t++) tsm+=Math.abs(c.g[oTag+t]); splat(w.scent,c.x,c.y, LEAK*clamp(tsm,0.2,2)/60);
    // DIVIDE / DIE
    if(c.fuel>DIV_THRESH && w.cells.length+born.length<MAXC){ const a=R()*6.283,r=CORE*1.3;
      const ch=mkCell(c.x+Math.cos(a)*r,c.y+Math.sin(a)*r, mut>0?mutate(c.g,mut):c.g, c.fuel*DIV_FRAC, c.lin, c.orig);
      ch.gen=c.gen+1; born.push(ch); c.fuel*=(1-DIV_FRAC); }
    if(c.fuel<=0) w.cells[k]=null;
  }
  w.cells=w.cells.filter(Boolean);
  for(const b of born){ if(w.cells.length<MAXC){ w.cells.push(b); w.births++; if(b.gen>w.gen)w.gen=b.gen; } }
}

/* ---------------- evolve one soup, snapshotting the whole genome pool by generation ---------------- */
function evolve(steps, snapEvery){
  const w=makeWorld(5);
  for(let i=0;i<300;i++) w.cells.push(mkCell(R(),R(),randGenome(),1.6,w.nextLin++));
  const snaps=[]; let lastSnapGen=-1;
  for(let s=0;s<steps;s++){ step(w,1.4,0.86,0.12);
    if(w.gen>=lastSnapGen+snapEvery && w.cells.length>40){
      snaps.push({ gen:w.gen, genomes:w.cells.map(c=>Float32Array.from(c.g)) }); lastSnapGen=w.gen; }
    if(w.cells.length===0){ w.cells.push(mkCell(R(),R(),randGenome(),1.6,w.nextLin++)); } // never spontaneously "spawn a species"; this is a bare abiogenesis floor so a total wipe doesn't end the measurement
  }
  return { w, snaps };
}

/* ---------------- CATEGORY-FREE ancestral tournament ----------------
 * Mix a frozen "later" pool (orig=1) and "earlier" pool (orig=0) 50/50 in a fresh
 * neutral world, mutation OFF, run a fixed window, return later's share of the
 * final population. >0.5 ⇒ later genomes are fitter in the same world ⇒ ascent. */
function tournament(poolLater, poolEarlier, seed, window=2400, nEach=70){
  R = rng(seed);
  const w=makeWorld(5);
  const pick=(pool,orig)=>{ for(let i=0;i<nEach;i++){ const g=pool[(R()*pool.length)|0]; w.cells.push(mkCell(R(),R(),Float32Array.from(g),1.8,i+1,orig)); } };
  pick(poolLater,1); pick(poolEarlier,0);
  for(let s=0;s<window;s++) step(w,1.4,0.86,0);   // mutation OFF: test the frozen genomes
  let later=0,tot=0; for(const c of w.cells){ tot++; if(c.orig===1)later++; }
  return tot? later/tot : 0.5;
}

/* ================================ run ================================ */
console.log('LAWFUL one-soup arena — no predator/prey, consumption = enzyme·tag chemistry.');
console.log('Evolving a soup and snapshotting the whole genome pool by generation...\n');
const t0=Date.now();
const { snaps } = evolve(26000, 6);
console.log(`captured ${snaps.length} generational snapshots (gens: ${snaps.map(s=>s.gen).join(', ')}) in ${((Date.now()-t0)/1000).toFixed(0)}s\n`);

if(snaps.length>=3){
  const early=snaps[0], mid=snaps[(snaps.length/2)|0], late=snaps[snaps.length-1];
  const SEEDS=[101,202,303,404,505];
  const mean=(a,b)=>{ let s=0; for(const sd of SEEDS) s+=tournament(a.genomes,b.genomes,sd); return s/SEEDS.length; };
  const se=(a,b,m)=>{ let v=0; for(const sd of SEEDS){ const x=tournament(a.genomes,b.genomes,sd); v+=(x-m)**2; } return Math.sqrt(v/SEEDS.length/SEEDS.length); };
  console.log('CATEGORY-FREE ANCESTRAL TOURNAMENT (later pool\'s share of the population; >0.50 = later wins):');
  console.log('  origin is a scoreboard label only — the cells never see it; predation/foraging/defence all fold into who captured more energy and left more descendants.\n');
  for(const [label,a,b] of [[`gen ${late.gen} vs gen ${early.gen}`,late,early],
                            [`gen ${late.gen} vs gen ${mid.gen}`,late,mid],
                            [`gen ${mid.gen} vs gen ${early.gen}`,mid,early],
                            [`gen ${early.gen} vs itself (control)`,early,early]]){
    const m=mean(a,b); console.log(`  ${label.padEnd(30)} later share ${m.toFixed(3)} ± ${se(a,b,m).toFixed(3)}  ${m>0.58?'LATER WINS':m<0.42?'earlier wins':'~tie'}`);
  }
  // a monotone-ish rising ladder along all consecutive snapshots
  console.log('\n  consecutive ladder (each newer gen vs the one before):');
  let wins=0,tot=0;
  for(let i=1;i<snaps.length;i++){ const m=mean(snaps[i],snaps[i-1]); tot++; if(m>0.5)wins++;
    console.log(`    gen ${String(snaps[i].gen).padStart(3)} vs gen ${String(snaps[i-1].gen).padStart(3)}: ${m.toFixed(3)} ${m>0.5?'↑':'↓'}`); }
  console.log(`\n  later beat earlier in ${wins}/${tot} consecutive steps.`);
  console.log(wins>=tot*0.7 ? '  => sustained, non-saturating ascent — later genomes keep out-competing older ones. The honest finite proxy for open-ended ("infinite") ascent, measured with NO entity/species/predator category.'
                            : '  => ascent is weak/plateaued here; the arms race needs a richer strategy space (evolvable morphology).');
}
