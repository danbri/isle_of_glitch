// Cache-busting for GitHub Pages: stamp a version onto the script/style URLs in index.html and onto every
// relative import in js/*.js, so a new commit is a new URL and browsers never serve a stale module.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const v = process.argv[2] || Date.now().toString(36);
let html = readFileSync('index.html', 'utf8');
html = html.replace(/(href="css\/app\.css|src="js\/app\.js|src="js\/mode-zxbasic\.js)(\?v=[^"]*)?"/g, `$1?v=${v}"`);
writeFileSync('index.html', html);
for (const f of readdirSync('js').filter(n => n.endsWith('.js'))) {
  const p = `js/${f}`;
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/from '\.\/([\w-]+\.js)(\?v=[^']*)?'/g, `from './$1?v=${v}'`).replace(/import\('\.\/([\w-]+\.js)(\?v=[^']*)?'/g, `import('./$1?v=${v}'`);
  if (out !== src) writeFileSync(p, out);
}
console.log('stamped version', v);
