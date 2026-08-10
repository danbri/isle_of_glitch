#!/usr/bin/env node
/**
 * The running world, as an MCP server.
 *
 * WHY THIS EXISTS. The world already has an HTTP control plane and it is the
 * efficient way to drive a run: one request, no browser, no lifecycle. But an
 * agent that has not been told the shapes cannot use it — it has to be handed
 * the route list, the action names, and the tune whitelist, and that briefing
 * goes stale the moment someone adds a parameter. MCP is the same API with
 * discovery attached, so Codex or an unattended loop can find the verbs and
 * their arguments without anybody writing them down again.
 *
 * WHY NOT A HEADLESS BROWSER. The browser is a VIEWER. The simulation runs in
 * the Deno server, so driving the page to change the world means automating a
 * UI that then makes the request this server makes directly — slower, with a
 * process to babysit. Worse, the usual browser readout is a screenshot, and a
 * bitmap is the worst context-per-fact trade available: hundreds of kilobytes
 * to answer a question that a line of text answers exactly. A browser is right
 * for one thing, which is checking what is only true at the pixels, and this
 * project has needed that twice.
 *
 * SO EVERY TOOL HERE RETURNS BOUNDED TEXT. Never a blob, never a full frame,
 * never every parameter when a diff will do. `status` returns a summary unless
 * asked otherwise; `archives` returns rows, not manifests; `report` is capped.
 * The point is that an agent can drive a long run without spending its context
 * on the driving.
 *
 * Run:  node tools/mcp-world.mjs [--url http://127.0.0.1:8899]
 * Wire: MCP stdio — newline-delimited JSON-RPC 2.0.
 */

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = (arg('url', process.env.MAZEBALLS_URL || 'http://127.0.0.1:8899')).replace(/\/$/, '');

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const text = (s) => ({ content: [{ type: 'text', text: String(s) }] });
const errText = (s) => ({ content: [{ type: 'text', text: String(s) }], isError: true });

async function api(path, init) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}: ${body.slice(0, 300)}`);
  try { return JSON.parse(body); } catch { return body; }
}
const post = (action, extra = {}) =>
  api('/control', { method: 'POST', body: JSON.stringify({ action, ...extra }) });

/* -------------------------------------------------------------- formatting */

const num = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString() : v) : v);

/**
 * The parameters worth reporting, with the value the world ships with. Only
 * differences are printed: a parameter at its default costs the reader a line
 * and tells them nothing.
 */
const DEFAULTS = {
  flowStr: 4, flowScale: 6, drag: 24, springK: 300, contract: 8, gravity: 0.55,
  morphRate: 0, heightScale: 0.018, eggExtent: 12,
  twistK: 6, vortK: 0.8, angDrag: 3,
  massRef: 0.34, densLo: 0.1, densHi: 10, mediumDens: 1,
  foreignReach: 1, foreignPush: 1.6, contactK: undefined, sapRate: undefined,
  wrapY: 1, tempCost: 0,
};

function summarise(st) {
  const dt = st.dt ?? 0.015;
  const secs = (st.steps ?? 0) * dt;
  const wt = secs < 5400 ? `${(secs / 60).toFixed(1)} min`
    : secs < 172800 ? `${(secs / 3600).toFixed(1)} h` : `${(secs / 86400).toFixed(1)} days`;
  const L = [];
  L.push(`step ${num(st.steps)} (${wt} world time)  boot ${st.bootId}  sim ${st.simVersion}`);
  L.push(`paused ${!!st.paused}  spf ${st.spf}  bound ${st.bound}  devo ${st.devoName}`);
  L.push(`alive ${num(st.alive)} bodies of ${num(st.bodySlots)} slots   cells ${num(st.cellsOwned ?? st.cells)}/${num(st.cellBudget)}`);
  L.push(`births ${num(st.births)}  deaths ${num(st.deaths)}  agedOut ${num(st.agedOut)}` +
         `  blocked ${num(st.blockedBirths)}  pendingEggs ${num(st.pendingEggs)}`);
  L.push(`meanEnergy ${Number(st.meanEnergy ?? 0).toFixed(2)}  minted ${st.mintedEnergy ?? 0}`);
  // Lineages first among the ecology numbers: a population down to a handful of
  // lines has no standing variation left, and that outranks anything else here.
  L.push(`LINEAGES ${st.lineages}` +
    (st.lineages <= 5 ? '   <- near-clonal; adaptation depends on new mutation' : ''));
  const g = st.genStats;
  if (g?.n) {
    L.push(`ancestor depth: median ${g.median} mean ${g.mean} p10-p90 ${g.p10}-${g.p90} max ${g.max}` +
      `   (the 'generation' field is a MAX and moves in jumps)`);
    const mx = Math.max(1, ...g.hist);
    L.push(`  hist[${g.lo}..${g.hi}] ` + g.hist.map(v => ' .:-=+*#%@'[Math.min(9, Math.round(v / mx * 9))]).join(''));
  }
  const diff = [];
  for (const [k, d] of Object.entries(DEFAULTS)) {
    if (st[k] === undefined || d === undefined) continue;
    if (Math.abs(st[k] - d) > 1e-9) diff.push(`${k} ${st[k]}`);
  }
  L.push(diff.length ? `params differing from default: ${diff.join('  ')}` : 'all sampled params at defaults');
  return L.join('\n');
}

/* ------------------------------------------------------------------- tools */

const TOOLS = [
  {
    name: 'world_status',
    description:
      'Current state of the running world: step count, population, lineages, the ancestor-depth ' +
      'distribution, and any parameters that differ from their defaults. Returns a compact summary ' +
      'by default; pass full:true only if you need the raw field set.',
    inputSchema: {
      type: 'object',
      properties: { full: { type: 'boolean', description: 'return the raw JSON instead of the summary' } },
    },
  },
  {
    name: 'world_tune',
    description:
      'Change physics parameters on the RUNNING world, without restarting. Restarting on changed ' +
      'physics should reseed, which destroys the population you were asking about, so this is the ' +
      'way to run an intervention. Names not on the server whitelist are rejected and reported. ' +
      'wrapY, hashCell and bucketM are deliberately not tunable: they change topology or the ' +
      'spatial hash, which makes a different world rather than an intervention in this one.',
    inputSchema: {
      type: 'object',
      properties: {
        params: {
          type: 'object',
          description: 'e.g. {"twistK": 9, "densHi": 20}. Numbers only.',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['params'],
    },
  },
  {
    name: 'world_control',
    description:
      'Lifecycle actions. pause/resume; speed sets steps per loop; save writes a snapshot; ' +
      'restart re-execs and RESUMES the same world (picks up code changes); reseed abandons it and ' +
      'starts fresh. Use reseed after a physics change — a population selected under the old laws ' +
      'contaminates anything measured after.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['pause', 'resume', 'save', 'restart', 'reseed', 'speed'] },
        spf: { type: 'number', description: 'steps per loop, for action=speed' },
      },
      required: ['action'],
    },
  },
  {
    name: 'world_lineages',
    description:
      'How standing variation is DISTRIBUTED, not just how many lineages exist. A count says 12 ' +
      'whether that is twelve equal lines or one line holding 99% and eleven stragglers about to ' +
      'die, and only the second is a collapse in progress. Returns Shannon entropy over lineage ' +
      'shares, effective lineages (2^H — the number of equally-common lines that would give the ' +
      'same entropy), the largest share, and the top few.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'world_health',
    description:
      'INTEGRITY CHECK, not a status readout. Looks for the failure modes that every other ' +
      'instrument here is blind to, because they all read the same CPU mirrors: cells the physics ' +
      'cannot see (radius 0 means no contact and no mass), orphan cells owned by no organism, ' +
      'births failing for want of contiguous arena, and an egg queue that is not draining. Reads ' +
      'the frame, so it sees what the GPU was actually given rather than what the server believes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'world_report',
    description:
      'One bounded paste describing this run, for handing to another agent: identity, population, ' +
      'ancestor depth, changed parameters, a short archive tail, and the standing caveats. Capped ' +
      'so it cannot flood a context window.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'world_archives',
    description:
      'Generation archives for THIS world, as rows — step, alive, lineages, mean energy, and the ' +
      'continuous material where the archive carries it. Boot-aware by default: the directory holds ' +
      'every run ever, so after a reseed a filename tail returns the previous world. Pass ' +
      'allBoots:true to see them all. Manifests are large and are never returned whole.',
    inputSchema: {
      type: 'object',
      properties: {
        last: { type: 'number', description: 'how many recent archives (default 6, max 30)' },
        allBoots: { type: 'boolean', description: 'include archives from other runs' },
      },
    },
  },
];

async function call(name, a = {}) {
  switch (name) {
    case 'world_status': {
      const st = await api('/status');
      return text(a.full ? JSON.stringify(st, null, 1) : summarise(st));
    }
    case 'world_tune': {
      if (!a.params || typeof a.params !== 'object') return errText('tune needs a params object');
      const r = await post('tune', { params: a.params });
      const applied = Object.entries(r.applied ?? {}).map(([k, v]) => `${k} ${v}`).join('  ') || '(none)';
      const rej = (r.rejected ?? []).length ? `\nrejected (not tunable): ${r.rejected.join(', ')}` : '';
      return text(`applied at step ${num(r.steps)}: ${applied}${rej}`);
    }
    case 'world_control': {
      const act = a.action;
      if (!act) return errText('control needs an action');
      const r = await post(act, act === 'speed' ? { spf: a.spf } : {});
      return text(`${act}: ${JSON.stringify(r)}`);
    }
    case 'world_report': {
      const st = await api('/status');
      const L = [summarise(st), ''];
      L.push('caveats an agent should know:');
      L.push('- not reproducible: the same seed twice differs (atomics in the spatial hash).');
      L.push('- locomotion is RETRACTED; bodies twitch but do not travel. See RESEARCH.md.');
      L.push('- development is CPU JavaScript, ~6 ms per egg — the largest non-GPU cost.');
      L.push('- archives written before repr:2 predate mass, orientation and varying radius.');
      let out = L.join('\n');
      if (out.length > 4000) out = out.slice(0, 4000) + '\n[truncated]';
      return text(out);
    }
    case 'world_archives': {
      const n = Math.max(1, Math.min(30, a.last ?? 6));
      const names = await api('/runs/archive/index.json').catch(() => null);
      if (!Array.isArray(names)) return errText('archive index not served over HTTP from this instance');
      // BOOT-AWARE. The directory holds every run, so after a reseed the last
      // filenames belong to the world that was replaced - a tail returns
      // gen-0201 from a 2.3M-step run beside gen-0013 from the one now going.
      // Same chimera the analytics panel was drawing.
      const st0 = await api('/status').catch(() => null);
      const mine = st0?.bootId;
      let picked = names, hidden = 0;
      if (!a.allBoots && mine) {
        const keep = [];
        for (const nm of names) {
          try {
            const d = await api('/runs/archive/' + nm);
            // STRICT. An archive without a bootId cannot be shown to belong to
            // this world, and "its step is lower than ours" is not evidence:
            // every reseed restarts the step count, so a previous short run
            // sits in exactly the same range. Including them produced a
            // non-monotonic series - step 76,363 at gen-0018 followed by
            // 75,418 at gen-0021 - which is two worlds, not one history.
            if (d.bootId && d.bootId === mine) keep.push(nm);
          } catch { /* unreadable: leave it out rather than guess */ }
        }
        hidden = names.length - keep.length;
        picked = keep;
      }
      const rows = [];
      for (const nm of picked.slice(-n)) {
        try {
          const d = await api('/runs/archive/' + nm);
          const m = d.creatures?.[0]?.material;
          rows.push(`${nm.replace('.json', '').padEnd(10)} step ${String(d.step).padStart(9)}` +
            `  alive ${String(d.alive).padStart(5)}  lineages ${String(d.lineages ?? '?').padStart(4)}` +
            `  meanE ${Number(d.meanEnergy ?? 0).toFixed(1)}  repr ${d.repr ?? 1}` +
            (m ? `  dens ${m.density} rad ${m.radius}` : ''));
        } catch { rows.push(`${nm}  (unreadable)`); }
      }
      const note = hidden ? `\n(${hidden} archives from other runs hidden; allBoots:true to include)` : '';
      return text((rows.join('\n') || 'no archives for this world yet') + note);
    }

    case 'world_lineages': {
      const st = await api('/status');
      const L = st.linStats;
      if (!L || !L.n) return errText('no lineage stats yet — the server needs one tick');
      const out = [
        `bodies ${num(L.n)}   lineages ${L.count}   EFFECTIVE ${L.effective}` +
          (L.effective < L.count / 2 ? '   <- the count overstates diversity' : ''),
        `entropy ${L.entropyBits} bits   largest lineage holds ${(100 * L.topShare).toFixed(1)}%` +
          (L.topShare > 0.5 ? '   <- one line holds the population' : ''),
        'top: ' + L.top.map(t => `L${t.lineage} ${t.bodies} (${(100 * t.share).toFixed(1)}%)`).join('  '),
      ];
      return text(out.join('\n'));
    }

    case 'world_health': {
      const st = await api('/status');
      const buf = await (await fetch(BASE + '/frame')).arrayBuffer();
      const dv = new DataView(buf);
      const HEAD = 56;
      const ver = dv.getUint32(52, true), hasStatic = dv.getUint32(48, true);
      const L = dv.getUint32(HEAD, true);
      const L4 = [];
      if (ver < 2 || !hasStatic) {
        L4.push(`frame format ${ver}, static ${hasStatic}: cannot read radius or material.`);
      } else {
        let at = HEAD + 4 + L * 8 + L * 4 + L * 4;
        at += ((L * 2) + 3) & ~3;              // theta
        at += L * 4 * 3;                        // idx, type, uid
        at += L * 4;                            // matW
        const rad = new Float32Array(buf.slice(at, at + L * 4));
        let zero = 0, fused = 0;
        for (let i = 0; i < L; i++) { if (!(rad[i] > 0)) zero++; else if (rad[i] > 0.38) fused++; }
        L4.push(`cells the physics cannot see: ${zero} of ${L} (${(100 * zero / L).toFixed(1)}%)` +
          (zero ? '   <- radius 0: no contact, mass at the clamp floor' : '   ok'));
        L4.push(`fused cells (radius > 0.38): ${fused}` +
          (fused ? '' : '   <- none: development relaxation is not reaching the world'));
      }
      const owned = st.cellsOwned, typed = st.cellsLiveTyped;
      if (owned != null && typed != null) {
        L4.push(`orphan cells: ${typed - owned}` +
          (typed === owned ? '   ok' : '   <- cells no organism owns, still crowding and rendering'));
      }
      L4.push(`blockedBirths ${num(st.blockedBirths)}` +
        (st.blockedBirths > 0 ? '   <- arena has no contiguous room; fragmentation' : '   ok'));
      L4.push(`pendingEggs ${num(st.pendingEggs)}` +
        (st.pendingEggs > 500 ? '   <- queue not draining; births are pump-limited, not energy-limited' : ''));
      L4.push(`lineages ${st.lineages}` + (st.lineages <= 5 ? '   <- near-clonal' : ''));
      L4.push(`mintedEnergy ${st.mintedEnergy ?? 0}` +
        ((st.mintedEnergy ?? 0) === 0 ? '   ok (conservation holds)' : '   <- ENERGY WAS MINTED'));
      return text(L4.join('\n'));
    }
    default:
      return errText(`unknown tool: ${name}`);
  }
}

/* ----------------------------------------------------------------- the loop */

let buf = '';
// SERIALISED, AND NOT KILLED BY A CLOSED PIPE.
//
// Two failures worth naming, both found by piping a batch of requests in and
// closing stdin. First, exiting on 'end' killed the process while a request was
// still awaiting the world, so anything asynchronous went unanswered. Second,
// a whole batch arrives in ONE data event, so the exit check has to know about
// lines that are buffered but not yet processed - guarding only on in-flight
// calls answered the first request and dropped the rest.
//
// So: one queue, drained strictly in order, and exit only when stdin is closed,
// the buffer holds no complete line, and nothing is in flight.
let draining = false;
let stdinClosed = false;

const maybeExit = () => {
  if (stdinClosed && !draining && buf.indexOf('\n') < 0) process.exit(0);
};

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return;            // notifications carry no id
  try {
    if (method === 'initialize') {
      ok(id, {
        protocolVersion: params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mazeballs-world', version: '1' },
      });
    } else if (method === 'tools/list') {
      ok(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      // A dead or unreachable world is a TOOL error, not a protocol error, so
      // the caller is told why instead of losing the session.
      try { ok(id, await call(params?.name, params?.arguments ?? {})); }
      catch (e) { ok(id, errText(`${params?.name} failed: ${e.message}\n(is the world running at ${BASE}?)`)); }
    } else if (method === 'ping') {
      ok(id, {});
    } else {
      fail(id, -32601, `method not found: ${method}`);
    }
  } catch (e) {
    fail(id, -32603, e.message);
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    await handle(msg);
  }
  draining = false;
  maybeExit();
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buf += chunk; drain(); });
process.stdin.on('end', () => { stdinClosed = true; maybeExit(); });
