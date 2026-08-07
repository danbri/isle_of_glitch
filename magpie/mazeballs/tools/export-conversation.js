/**
 * RENDER THE SESSION TRANSCRIPTS INTO SOMETHING READABLE.
 *
 * Claude Code already writes every session to disk as JSONL, under
 * ~/.claude/projects/<slugified-cwd>/<session-id>.jsonl. Those files are the
 * record and they are already private — they sit on this machine and nothing
 * uploads them. What they are not is readable: one JSON object per line, tool
 * calls and results inline, tens of megabytes.
 *
 * This renders them to markdown, one file per session, into a directory that is
 * GITIGNORED. That last part is the important one: this repository is published
 * to GitHub Pages, so writing a conversation into it would make it public. The
 * output goes to `conversations/`, which .gitignore excludes, and nothing here
 * sends anything anywhere.
 *
 *   deno run -A tools/export-conversation.js            # all sessions
 *   deno run -A tools/export-conversation.js --full     # include tool payloads
 *
 * By default tool calls are summarised to one line each — the command and a
 * short result — because the full payloads are the bulk of the file and are
 * rarely what anyone is looking for. --full keeps them.
 */
const HOME = Deno.env.get('HOME');
const SRC = `${HOME}/.claude/projects/-Users-danbri-working-mazeballs-isle-of-glitch-magpie-mazeballs`;
const OUT = new URL('../conversations', import.meta.url).pathname;
const FULL = Deno.args.includes('--full');

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

function renderContent(c, out) {
  if (typeof c === 'string') { out.push(c); return; }
  if (!Array.isArray(c)) return;
  for (const part of c) {
    if (part.type === 'text' && part.text?.trim()) out.push(part.text);
    else if (part.type === 'thinking') { /* omitted: not part of the exchange */ }
    else if (part.type === 'tool_use') {
      const inp = part.input ?? {};
      const one = inp.command ?? inp.file_path ?? inp.pattern ?? inp.url ?? inp.prompt ?? '';
      if (FULL) {
        out.push(`\n\`\`\`\n[${part.name}]\n${JSON.stringify(inp, null, 1).slice(0, 4000)}\n\`\`\`\n`);
      } else {
        out.push(`\n> \`${part.name}\` — ${clip(one, 160)}\n`);
      }
    } else if (part.type === 'tool_result') {
      const body = typeof part.content === 'string'
        ? part.content
        : (part.content ?? []).map((x) => x.text ?? '').join('\n');
      if (FULL) out.push(`\n\`\`\`\n${String(body).slice(0, 6000)}\n\`\`\`\n`);
      else if (body?.trim()) out.push(`> → ${clip(body, 200)}\n`);
    }
  }
}

await Deno.mkdir(OUT, { recursive: true });
let files = [];
try {
  for await (const e of Deno.readDir(SRC)) if (e.isFile && e.name.endsWith('.jsonl')) files.push(e.name);
} catch (e) {
  console.error(`no transcripts at ${SRC}: ${e.message}`);
  Deno.exit(1);
}
files.sort();

for (const f of files) {
  const raw = await Deno.readTextFile(`${SRC}/${f}`);
  const lines = raw.split('\n').filter(Boolean);
  const out = [];
  let first = null, last = null, nUser = 0, nAsst = 0;

  for (const ln of lines) {
    let rec;
    try { rec = JSON.parse(ln); } catch { continue; }
    const ts = rec.timestamp ?? rec.ts;
    if (ts) { first ??= ts; last = ts; }
    const m = rec.message;
    if (!m || !m.role) continue;
    const body = [];
    renderContent(m.content, body);
    const text = body.join('\n').trim();
    if (!text) continue;
    if (m.role === 'user') {
      // Tool results come back as role:user; only count real turns.
      const isToolOnly = Array.isArray(m.content) &&
        m.content.every((p) => p.type === 'tool_result');
      if (!isToolOnly) { nUser++; out.push(`\n---\n\n## danbri\n\n${text}\n`); }
      else out.push(text);
    } else {
      nAsst++;
      out.push(`\n### claude\n\n${text}\n`);
    }
  }

  const head = [
    `# Session ${f.replace('.jsonl', '')}`, '',
    `- source: \`${SRC}/${f}\``,
    `- first: ${first ?? 'unknown'}`,
    `- last: ${last ?? 'unknown'}`,
    `- turns: ${nUser} from danbri, ${nAsst} from claude`,
    `- rendered: ${FULL ? 'full tool payloads' : 'tool calls summarised to one line'}`,
    '', '> Private. `conversations/` is gitignored — this repository publishes to',
    '> GitHub Pages and anything committed here would be public.', '',
  ].join('\n');

  const dest = `${OUT}/${f.replace('.jsonl', '')}.md`;
  await Deno.writeTextFile(dest, head + out.join('\n'));
  const kb = Math.round((await Deno.stat(dest)).size / 1024);
  console.log(`${dest}  (${nUser} user turns, ${kb} KB)`);
}
console.log(`\n${files.length} session(s) rendered to ${OUT}`);
console.log('Nothing was uploaded. The files are on this machine only.');
