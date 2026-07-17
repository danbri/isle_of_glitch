#!/usr/bin/env node
/*
 * Repo timeline — renders git history as a static page (docs/timeline.html).
 * Groups commits by day, marks releases (subjects starting "Release:"),
 * and links each commit to GitHub. Re-run any time; no inputs.
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = "https://github.com/danbri/isle_of_glitch";

const raw = execSync(
  'git log --reverse --date=format:"%Y-%m-%d %H:%M" --pretty=format:"%h\t%ad\t%s"',
  { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

const days = new Map();
for (const line of raw.split("\n")) {
  const [hash, date, ...rest] = line.split("\t");
  if (!hash) continue;
  const subject = rest.join("\t");
  const [day, time] = date.split(" ");
  if (!days.has(day)) days.set(day, []);
  days.get(day).push({ hash, time, subject, release: /^Release:/i.test(subject) });
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDay = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB",
  { weekday: "short", day: "numeric", month: "long", year: "numeric" });

let rows = "";
for (const [day, commits] of days) {
  rows += `<section><h2>${fmtDay(day)} <small>${commits.length} commit${commits.length > 1 ? "s" : ""}</small></h2><ul>`;
  for (const c of commits) {
    rows += `<li${c.release ? ' class="release"' : ""}><span class="t">${c.time}</span>` +
      `<a class="h" href="${REPO}/commit/${c.hash}">${c.hash}</a>` +
      `<span class="s">${esc(c.subject)}</span></li>`;
  }
  rows += "</ul></section>";
}

const total = [...days.values()].reduce((s, c) => s + c.length, 0);
const releases = [...days.values()].flat().filter((c) => c.release).length;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tellyclub — repository timeline</title>
<style>
  :root { color-scheme: dark; }
  body { background: #0b0b0b; color: #eee; font: 15px/1.5 "Trebuchet MS", "Segoe UI", sans-serif;
         max-width: 860px; margin: 0 auto; padding: 28px 16px 60px; }
  h1 { font-size: 26px; } h1 span { color: rgb(198,96,12); }
  .meta { opacity: .6; margin-bottom: 28px; }
  h2 { font-size: 16px; margin: 26px 0 6px; border-bottom: 1px solid rgba(255,255,255,.15); padding-bottom: 4px; }
  h2 small { opacity: .55; font-weight: normal; font-size: 12px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; gap: 10px; padding: 3px 6px; border-radius: 6px; align-items: baseline; }
  li.release { background: rgba(198,96,12,.14); border-left: 3px solid rgb(198,96,12); }
  .t { opacity: .5; font-size: 12px; flex: 0 0 40px; }
  .h { font-family: ui-monospace, monospace; font-size: 12px; color: rgba(120,180,255,.85);
       text-decoration: none; flex: 0 0 62px; }
  .h:hover { text-decoration: underline; }
  .s { flex: 1; }
</style></head><body>
<h1>telly<span>club</span> — repository timeline</h1>
<div class="meta">${total} commits · ${releases} releases · generated ${new Date().toISOString().slice(0, 10)}
 · <a href="${REPO}" style="color:rgba(120,180,255,.85)">${REPO.replace("https://", "")}</a></div>
${rows}
</body></html>`;

const out = join(ROOT, "docs", "timeline.html");
writeFileSync(out, html);
console.log(`wrote docs/timeline.html — ${total} commits over ${days.size} days, ${releases} releases`);
