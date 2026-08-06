/**
 * Cell identity and descent — the tree of life as the primary record.
 *
 * THE CLAIM THIS IMPLEMENTS. Nothing appears from nowhere. Every cell was made
 * by one cell, or by two, and exactly one cell in the history of a world made
 * itself: cellzero. "Organism", "species" and "clone" are then circles we draw
 * around parts of that structure afterwards — queries, not primitives, and free
 * to be wrong without the world being wrong.
 *
 * TREE OR DAG. With one parent it is a tree. The moment two-parent creation
 * exists it is a DAG, and anything that walks it must know that. The record is
 * built for two parents now because retrofitting arity into a lineage format is
 * miserable; the MECHANISM of two-parent creation is separate work and does not
 * exist yet, so parentB is -1 everywhere so far.
 *
 * WHY IDS RATHER THAN SLOTS. Arena slots are recycled. A slot index answers
 * "what is here now" and is useless for "is this the same cell as before" — a
 * distinction this project has already paid for once, when a displacement
 * measurement tracked bodies by slot and recorded recycling as movement.
 *
 * WHERE IT LIVES. Live cells carry their own id and their parents' ids, so
 * immediate descent is answerable in memory with no lookup. Full ancestry needs
 * the dead too, and that goes to an append-only log on disk: roughly 60 bytes a
 * record at about four creations a step, so a hundred megabytes an hour and very
 * compressible. That file IS the tree of life, and it outlives the process.
 */

/** The one self-creating cell. Every id traces back to this or the world lied. */
export const CELLZERO = 0;

export class Lineage {
  /**
   * @param {object} o
   * @param {string} [o.path]      append-only log; omit to keep it in memory only
   * @param {number} [o.flushEvery] records buffered before a write
   */
  constructor({ path = null, flushEvery = 4096 } = {}) {
    this.path = path;
    this.flushEvery = flushEvery;
    // Starts at 1 so that 0 is CELLZERO and -1 is "no parent", which keeps both
    // sentinels distinguishable from a real id.
    this.nextCell = 1;
    this.nextBook = 1;
    this.buf = [];
    this.written = 0;
    this.enc = new TextEncoder();
  }

  /**
   * Mint an id for a new cell.
   * @param {number} parentA  id of the cell that divided, or CELLZERO's -1
   * @param {number} parentB  second parent for syngamy, -1 when there is none
   * @param {number} lifebook which genome this cell carries
   * @param {number} step     when, in world steps
   */
  cell(parentA, parentB, lifebook, step) {
    const id = this.nextCell++;
    this.buf.push(`${id},${parentA},${parentB},${lifebook},${step}`);
    if (this.buf.length >= this.flushEvery) this.flush();
    return id;
  }

  /**
   * Mint a lifebook — a new chapter in the tree.
   *
   * This is the branch point that matters. Cells within a body share a lifebook
   * and are therefore clonal; an egg copies its parent's with variation, and
   * THAT is where a line divides. Two lifebooks may hold identical genomes by
   * coincidence and are still different chapters, because descent is a fact and
   * similarity is an observation.
   */
  book(parentBook, step) {
    const id = this.nextBook++;
    this.buf.push(`B${id},${parentBook},${step}`);
    if (this.buf.length >= this.flushEvery) this.flush();
    return id;
  }

  flush() {
    if (!this.buf.length) return;
    const n = this.buf.length;
    if (this.path) {
      try {
        Deno.writeTextFileSync(this.path, this.buf.join('\n') + '\n', { append: true });
      } catch (e) {
        // A lineage log that cannot be written must not stop the world. Say so
        // once and carry on with in-memory descent, which is still correct for
        // every living cell.
        if (!this.warned) { console.error('lineage log unwritable:', e.message); this.warned = true; }
      }
    }
    this.written += n;
    this.buf.length = 0;
  }

  stats() {
    return { cells: this.nextCell - 1, books: this.nextBook - 1, written: this.written };
  }
}
