/**
 * One world-snapshot format, for everything that saves a world.
 *
 * The serialiser lived inside `tools/serve-world.js`, which was fine while a
 * file on disk was the only place a world could go. It is no longer: the page
 * served from GitHub Pages runs its own simulation with no server behind it, and
 * a world it cannot save is one that vanishes on reload.
 *
 * Two implementations of one binary format would drift, and the drift would be
 * silent — a snapshot that loads and produces a subtly wrong world is far worse
 * than one that refuses. So the encode and decode live here, take everything
 * they need as arguments, and do no I/O at all. The server writes the bytes to a
 * file; the browser puts the same bytes in IndexedDB.
 *
 * THE FORMAT, unchanged from the version that wrote every existing snapshot:
 *
 *   0   u32  magic 'WRN2'
 *   4   u32  version
 *   8   u32  cell slots
 *   12  u32  bondK
 *   16  u32  steps
 *   20  f32  bound
 *   24  u32  births
 *   28  u32  deaths
 *   32  u32  nextUid
 *   36  u32  arena blob length
 *   40  u32  arena islands
 *   44  u32  founder cells
 *   64       arena blob, then the per-cell arrays in a fixed order
 */

export const SNAP_MAGIC = 0x324e5257;        // 'WRN2'
export const SNAP_MAGIC_V1 = 0x314e5257;     // 'WRN1' — pre-packed cmeta

/** The per-cell arrays, in the order they are written. Order IS the format. */
function cellArrays(cells, evo) {
  return [
    cells.ctype, cells.cslot, cells.body, cells.bodySize,
    cells.bond, cells.brest,
    evo.uid, evo.parentUid, evo.generation, evo.lineage, evo.birthStep,
  ];
}

/**
 * Serialise a world to bytes. Caller supplies the already-read GPU state, since
 * reading it is asynchronous and this stays pure.
 *
 * @param {object} o
 * @param {Float32Array} o.pos     positions, read back from the GPU
 * @param {Float32Array} o.energy  energies, read back from the GPU
 * @param {Uint8Array}   o.arenaBlob  arena.snapshot(), after brains.readState
 */
export function encodeWorld({ pos, energy, arenaBlob, cells, evo, n, bondK,
                              steps, bound, arenaIslands, founderCells }) {
  const head = new ArrayBuffer(64);
  const hv = new DataView(head);
  hv.setUint32(0, SNAP_MAGIC, true);
  hv.setUint32(4, 1, true);
  hv.setUint32(8, n, true);
  hv.setUint32(12, bondK, true);
  hv.setUint32(16, steps, true);
  hv.setFloat32(20, bound, true);
  hv.setUint32(24, evo.births, true);
  hv.setUint32(28, evo.deaths, true);
  hv.setUint32(32, evo.nextUid, true);
  hv.setUint32(36, arenaBlob.byteLength, true);
  hv.setUint32(40, arenaIslands, true);
  hv.setUint32(44, founderCells, true);

  const bytes = [new Uint8Array(head), arenaBlob,
                 new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength),
                 new Uint8Array(energy.buffer, energy.byteOffset, energy.byteLength)];
  for (const a of cellArrays(cells, evo)) {
    bytes.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  let total = 0;
  for (const b of bytes) total += b.byteLength;
  const out = new Uint8Array(total);
  let at = 0;
  for (const b of bytes) { out.set(b, at); at += b.byteLength; }
  return out;
}

/**
 * Read the header and hand back the arena blob plus a cursor, leaving the caller
 * to restore into its own arrays — which differ between the server and the page
 * only in where they live, not in what they are.
 */
export function decodeHeader(raw) {
  const hv = new DataView(raw.buffer, raw.byteOffset);
  const magic = hv.getUint32(0, true);
  if (magic === SNAP_MAGIC_V1) {
    throw new Error(
      'this snapshot predates packed cell metadata (WRN1). Resuming it would give ' +
      'every cell zero contractility — a world of bodies that cannot contract a ' +
      'single bond, with nothing in the logs to say so. Start a fresh world.');
  }
  if (magic !== SNAP_MAGIC) throw new Error('not a world snapshot');
  const arenaLen = hv.getUint32(36, true);
  return {
    n: hv.getUint32(8, true), bondK: hv.getUint32(12, true),
    steps: hv.getUint32(16, true), bound: hv.getFloat32(20, true),
    births: hv.getUint32(24, true), deaths: hv.getUint32(28, true),
    nextUid: hv.getUint32(32, true),
    arenaIslands: hv.getUint32(40, true), founderCells: hv.getUint32(44, true),
    arenaBlob: raw.subarray(64, 64 + arenaLen),
    bodyOffset: 64 + arenaLen,
  };
}

/**
 * Fill the caller's arrays from the body of a snapshot. `pos` and `energy` come
 * back separately because they go to the GPU rather than into `cells`.
 */
export function decodeBody(raw, offset, cells, evo, n) {
  let at = offset;
  const take = (arr) => {
    new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
      .set(raw.subarray(at, at + arr.byteLength));
    at += arr.byteLength;
  };
  const pos = new Float32Array(n * 2), energy = new Float32Array(n);
  take(pos); take(energy);
  for (const a of cellArrays(cells, evo)) take(a);
  return { pos, energy };
}
