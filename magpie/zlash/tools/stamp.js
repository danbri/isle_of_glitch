// Cache-busting for GitHub Pages: stamp a version onto the script/style URLs in index.html and onto every
// relative import in js/*.js and pugzx/*.js, so a new commit is a new URL and browsers never serve a stale module.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const v = process.argv[2] || Date.now().toString(36);
let html = readFileSync('index.html', 'utf8');
html = html.replace(/(href="css\/app\.css|src="js\/app\.js|src="js\/mode-zxbasic\.js)(\?v=[^"]*)?"/g, `$1?v=${v}"`);
writeFileSync('index.html', html);
for (const p of ['js', 'pugzx'].flatMap(d => readdirSync(d).filter(n => n.endsWith('.js')).map(n => `${d}/${n}`))) {
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/from '(\.\.?\/(?:pugzx\/)?[\w-]+\.js)(\?v=[^']*)?'/g, `from '$1?v=${v}'`).replace(/import\('(\.\.?\/(?:pugzx\/)?[\w-]+\.js)(\?v=[^']*)?'/g, `import('$1?v=${v}'`);
  if (out !== src) writeFileSync(p, out);
}
for (const p of readdirSync('pugzx').filter(n => n.endsWith('.html')).map(n => `pugzx/${n}`)) {
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/(src="pugzx\.js|from '\.\/pugzx\.js)(\?v=[^"']*)?(["'])/g, `$1?v=${v}$3`);
  if (out !== src) writeFileSync(p, out);
}
console.log('stamped version', v);
