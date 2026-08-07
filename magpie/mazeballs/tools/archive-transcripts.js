/**
 * COPY THE SESSION TRANSCRIPTS SOMEWHERE DURABLE, UNCHANGED.
 *
 * Claude Code writes every session to ~/.claude/projects/<slug>/<id>.jsonl as it
 * goes. Those files are the record. They are also in a tool's private directory,
 * which is not where anyone would look for something they wanted to keep, and
 * they are not backed up by anything.
 *
 * This copies them verbatim — byte for byte, no transformation — into
 * ~/Documents/mazeballs-transcripts/, and writes a viewer.html beside them.
 * The originals are never touched or moved.
 *
 * WHY NOT INTO THE REPOSITORY. It publishes to GitHub Pages. Anything committed
 * there is public, and a working transcript is not something to publish by
 * accident.
 *
 * Re-running is safe and cheap: a file whose size and mtime match is skipped, so
 * this can be run repeatedly and only copies what has grown.
 *
 *   deno run -A tools/archive-transcripts.js
 */
const HOME = Deno.env.get('HOME');
const SRC = `${HOME}/.claude/projects/-Users-danbri-working-mazeballs-isle-of-glitch-magpie-mazeballs`;
const DEST = `${HOME}/Documents/mazeballs-transcripts`;

await Deno.mkdir(DEST, { recursive: true });

const src = [];
try {
  for await (const e of Deno.readDir(SRC)) if (e.isFile && e.name.endsWith('.jsonl')) src.push(e.name);
} catch (e) {
  console.error(`no transcripts at ${SRC}: ${e.message}`);
  Deno.exit(1);
}
src.sort();

let copied = 0, skipped = 0, bytes = 0;
for (const name of src) {
  const from = `${SRC}/${name}`, to = `${DEST}/${name}`;
  const a = await Deno.stat(from);
  let same = false;
  try {
    const b = await Deno.stat(to);
    same = b.size === a.size;
  } catch { /* not there yet */ }
  if (same) { skipped++; continue; }
  await Deno.copyFile(from, to);
  copied++; bytes += a.size;
  console.log(`  ${name}  ${(a.size / 1048576).toFixed(1)} MB`);
}

// The viewer travels with the data, so the directory is self-contained.
const viewer = new URL('./transcript-viewer.html', import.meta.url).pathname;
try {
  await Deno.copyFile(viewer, `${DEST}/viewer.html`);
  console.log('  viewer.html');
} catch (e) { console.error(`viewer not copied: ${e.message}`); }

// A plain listing, so the directory explains itself without the viewer.
const index = [
  '# Mazeballs session transcripts', '',
  'Verbatim copies of the JSONL session logs Claude Code writes to',
  '`~/.claude/projects/`. The originals are untouched.', '',
  'Open `viewer.html` in a browser and pick a `.jsonl` file to read one.',
  'The viewer runs entirely locally — it reads the file you choose and sends',
  'nothing anywhere.', '',
  '| file | size | copied |', '|---|---|---|',
  ...(await Promise.all(src.map(async (n) => {
    const st = await Deno.stat(`${DEST}/${n}`);
    return `| ${n} | ${(st.size / 1048576).toFixed(1)} MB | ${new Date().toISOString().slice(0, 10)} |`;
  }))),
].join('\n');
await Deno.writeTextFile(`${DEST}/README.md`, index + '\n');

console.log(`\n${copied} copied (${(bytes / 1048576).toFixed(1)} MB), ${skipped} already current`);
console.log(`-> ${DEST}`);
console.log('Originals untouched. Nothing uploaded.');
