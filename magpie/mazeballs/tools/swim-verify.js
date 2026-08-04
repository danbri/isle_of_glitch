#!/usr/bin/env node
/* swim-verify.js — prove the grip-affordance locomotion primitive actually moves a
 * body, BEFORE wrapping it in a page. A body is a chain of nodes + springs; muscles
 * drive a traveling lateral wave (undulation); drag is ANISOTROPIC (perpendicular >
 * along), scaled by a substrate `grit`. Prediction (primitives.md):
 *   - grip ON  + muscle ON  on gritty ground  -> large net displacement (swims)
 *   - grip OFF (isotropic drag)               -> ~0 (scallop: undulation cancels)
 *   - muscle OFF                              -> ~0 (nothing drives it)
 *   - grip ON  + muscle ON  on SMOOTH ground  -> small (no purchase)               */
const N = 9, L0 = 0.02, SPRING = 240, SPRINGD = 6, AMP = 34, KWAVE = 1.15, OMEGA = 9.0;
const DRAG = 9.0, SLIP = 0.15, GRIP = 6.0;   // kPerp gets GRIP× the grit term when grip on

function makeBody(x0, y0){ const p=[]; for(let i=0;i<N;i++) p.push({x:x0+i*L0, y:y0, vx:0, vy:0}); return p; }
function axisAt(p,j){ const a=p[Math.max(0,j-1)], b=p[Math.min(N-1,j+1)]; let dx=b.x-a.x, dy=b.y-a.y;
  const d=Math.hypot(dx,dy)||1e-9; return [dx/d, dy/d]; }

function step(p, t, dt, grit, grip, muscle){
  const fx=new Float64Array(N), fy=new Float64Array(N);
  // springs (keep the chain together) + spring damping
  for(let i=0;i<N-1;i++){ const a=p[i], b=p[i+1]; let dx=b.x-a.x, dy=b.y-a.y; const d=Math.hypot(dx,dy)||1e-9;
    const f=SPRING*(d-L0); const ux=dx/d, uy=dy/d;
    const rvx=b.vx-a.vx, rvy=b.vy-a.vy, rv=(rvx*ux+rvy*uy)*SPRINGD;
    const F=f+rv; fx[i]+=F*ux; fy[i]+=F*uy; fx[i+1]-=F*ux; fy[i+1]-=F*uy; }
  // muscle: traveling lateral wave pushes internal nodes perpendicular to the body axis
  if(muscle) for(let j=1;j<N-1;j++){ const [ax,ay]=axisAt(p,j); const px=-ay, py=ax;
    const drive=AMP*Math.sin(j*KWAVE - OMEGA*t); fx[j]+=px*drive; fy[j]+=py*drive; }
  // integrate velocity, then ANISOTROPIC drag (the grip), then position
  for(let j=0;j<N;j++){ const c=p[j]; c.vx+=fx[j]*dt; c.vy+=fy[j]*dt;
    const [ax,ay]=axisAt(p,j); const px=-ay, py=ax;
    let vA=c.vx*ax+c.vy*ay, vP=c.vx*px+c.vy*py;
    const kA=DRAG*(SLIP+grit);
    const kP=DRAG*(SLIP+(grip?GRIP:1)*grit);      // grip amplifies resistance to sideways slip
    vA*=Math.exp(-kA*dt); vP*=Math.exp(-kP*dt);
    c.vx=ax*vA+px*vP; c.vy=ay*vA+py*vP;
    c.x+=c.vx*dt; c.y+=c.vy*dt; }
}
function centroid(p){ let x=0,y=0; for(const c of p){x+=c.x;y+=c.y;} return [x/N,y/N]; }
function run(grit, grip, muscle, steps=3000){ const p=makeBody(0.5,0.5); const [x0,y0]=centroid(p);
  let t=0; const dt=1/120; for(let s=0;s<steps;s++){ step(p,t,dt,grit,grip,muscle); t+=dt; }
  const [x1,y1]=centroid(p); return Math.hypot(x1-x0,y1-y0); }

console.log('net centroid displacement over 3000 steps (world units; body length ~'+((N-1)*L0).toFixed(2)+'):\n');
const rows = [
  ['gritty  grip+muscle', run(0.9, true,  true )],
  ['gritty  NO-grip (iso)', run(0.9, false, true )],
  ['gritty  muscle OFF',  run(0.9, true,  false)],
  ['smooth  grip+muscle', run(0.1, true,  true )],
];
for(const [label,d] of rows) console.log('  '+label.padEnd(22)+' '+d.toFixed(4)+'  ('+(d/((N-1)*L0)).toFixed(1)+' body-lengths)');
const swims = rows[0][1], scallop = rows[1][1], dead = rows[2][1], water = rows[3][1];
console.log('\nverdict: '+((swims > 5*scallop && swims > 5*dead && swims > 2*water)
  ? 'PASS — grip converts undulation into travel; without grip it is a scallop.'
  : 'FAIL — tune constants (AMP/OMEGA/GRIP/DRAG).'));
