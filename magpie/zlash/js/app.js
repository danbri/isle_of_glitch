import { buildProgram, BasicError, setEmojiRenderer } from './compiler.js?v=mvlk267s';
import { defineZxBasicMode } from './mode-zxbasic.js?v=mvlk267s';
import { EXAMPLES } from './examples.js?v=mvlk267s';
import { tapToListing } from './tap.js?v=mvlk267s';

const $ = (s) => document.querySelector(s);
const STORE = 'zxflash.src', STORE_EX = 'zxflash.example';

defineZxBasicMode(CodeMirror);
const editor = CodeMirror.fromTextArea($('#editor'), {
  mode: 'zxbasic', lineNumbers: true, lineWrapping: true, indentWithTabs: false, tabSize: 2,
  extraKeys: {
    'Ctrl-Enter': () => run(true), 'Cmd-Enter': () => run(true),
    'Esc': () => setTab('screen'),
  },
});

// ---- emoji rasteriser: the browser's own colour emoji font, sampled into an alpha bitmap ----
setEmojiRenderer((text, size) => {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, size, size);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (/\p{Extended_Pictographic}/u.test(text)) {
    g.font = `${Math.round(size * 0.82)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.fillText(text, size / 2, size / 2 + size * 0.04);
  } else { // plain text: chunky outlined cartoon lettering, shrunk to fit the width (titles, score pop-ups)
    const face = (px) => `900 ${px}px "Arial Rounded MT Bold", "Trebuchet MS", "Arial Black", sans-serif`;
    let px = size * 0.7;
    g.font = face(px);
    const w = g.measureText(text).width;
    if (w > size * 0.86) { px *= size * 0.86 / w; g.font = face(px); }
    const fill = g.createLinearGradient(0, size / 2 - px / 2, 0, size / 2 + px / 2);
    fill.addColorStop(0, '#fff7b0'); fill.addColorStop(0.5, '#ffd23a'); fill.addColorStop(1, '#ff7a1a');
    g.lineJoin = 'round'; g.lineWidth = Math.max(2, px * 0.2); g.strokeStyle = '#2a1052';
    g.strokeText(text, size / 2, size / 2);
    g.fillStyle = fill; g.fillText(text, size / 2, size / 2);
  }
  return { width: size, height: size, rgba: g.getImageData(0, 0, size, size).data };
});

// ---- Ruffle ----
const ruffle = window.RufflePlayer.newest();
const player = ruffle.createPlayer();
$('#player-host').append(player);
let lastSwf = null, swfName = 'zxflash', progName = '', progSrc = null, settingSource = false;
function setSource(src) {
  settingSource = true;
  try { editor.setValue(src); } finally { settingSource = false; }
}
function showName() {
  const edited = progSrc !== null && editor.getValue() !== progSrc;
  $('#progname').textContent = progName ? progName + (edited ? ' (edited)' : '') : 'untitled';
}

let busyShownAt = 0;
function busy(on) {
  const el = $('#compiling');
  el.hidden = !on;
  el.style.display = on ? 'flex' : 'none';
}
let loading = null, pending = null;
function loadSwf(bytes) {
  lastSwf = bytes;
  if (loading) { pending = bytes; return loading; } // a load is in flight: queue the newest movie
  loading = doLoad(bytes).finally(() => { loading = null; if (pending) { const b = pending; pending = null; loadSwf(b); } });
  return loading;
}
async function doLoad(bytes) {
  try {
    await player.ruffle().load({
    data: bytes, swfFileName: 'zxflash.swf',
    autoplay: 'on', unmuteOverlay: 'hidden', letterbox: 'on', scale: 'showAll',
    // script access lets LOADER's getURL('#name', '_self') through; FX is limited to drawing methods so BASIC can't reach other getURLs
    backgroundColor: '#000000', allowScriptAccess: true, contextMenu: 'rightClickOnly',
    splashScreen: false, warnOnUnsupportedContent: false, logLevel: window.zxflash?.trace ? 'info' : 'warn',
    maxExecutionDuration: 5,
    });
  } finally {
    busy(false);
    // A freshly loaded Ruffle instance only takes keys after it sees the player gain focus;
    // focus() on the already-focused element fires nothing, so blur first.
    if (document.body.dataset.tab === 'screen') { player.blur(); player.focus(); }
  }
}

// ---- compile & run ----
let errMark = null;
function clearError() {
  if (errMark !== null) { editor.removeLineClass(errMark, 'background', 'line-error'); editor.setGutterMarker(errMark, 'CodeMirror-linenumbers', null); errMark = null; }
}
function showError(e) {
  const st = $('#status');
  st.className = 'status err';
  $('#meta').textContent = '';
  if (e instanceof BasicError) {
    st.innerHTML = `<span>C ${esc(e.message)}, line ${e.line}:${e.col}</span>`;
    const ln = e.line - 1;
    editor.addLineClass(ln, 'background', 'line-error');
    const g = document.createElement('span'); g.textContent = '?'; g.className = 'gutter-error';
    editor.setGutterMarker(ln, 'CodeMirror-linenumbers', g);
    errMark = ln;
  } else {
    st.innerHTML = `<span>Compiler fault: ${esc(e.message)}</span>`;
    console.error(e);
  }
}
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

let timer = null, lastSrc = null;
function run(force = false) {
  const src = editor.getValue();
  if (!force && src === lastSrc) return;
  lastSrc = src;
  try { localStorage.setItem(STORE, src); localStorage.setItem(STORE_EX, progSrc !== null && src === progSrc ? progName : ''); } catch (_) { /* ignore */ }
  clearError();
  busy(true);
  let r;
  try { r = buildProgram(src, { trace: !!window.zxflash?.trace }); } catch (e) { showError(e); busy(false); return; }
  const st = $('#status');
  st.className = 'status ok';
  st.innerHTML = `<span>0 OK</span><span class="detail">${r.lines} lines &middot; ${r.bytecode} bytes AVM1 &middot; ${(r.swf.length / 1024).toFixed(1)} KB swf &middot; ${r.ms.toFixed(1)} ms</span>`;
  $('#meta').textContent = r.vars.filter(v => v.startsWith('b_')).map(v => v.slice(2)).join(' ');
  loadSwf(r.swf);
}
function schedule() {
  if (!$('#auto').checked) return;
  clearTimeout(timer);
  timer = setTimeout(() => run(false), 600);
}
editor.on('change', () => {
  // An example link always opens the bundled version. Remove it when editing so
  // a reload restores the saved work instead of replacing it with that example.
  if (!settingSource && editor.getValue() !== progSrc && exampleFromHash()) setExampleHash('', true);
  schedule(); showName();
});
$('#run').addEventListener('click', () => run(true));
$('#download').addEventListener('click', () => {
  if (!lastSwf) run(true);
  if (!lastSwf) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lastSwf], { type: 'application/x-shockwave-flash' }));
  a.download = swfName + '.swf'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ---- tabs ----
function setTab(name) {
  document.body.dataset.tab = name;
  document.querySelectorAll('.tab').forEach(b => {
    const active = b.dataset.tab === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  if (name === 'code') setTimeout(() => editor.focus(), 50);
  if (name === 'screen') setTimeout(() => player.focus(), 50);
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.dataset.tab !== 'code') { setTab('code'); e.preventDefault(); }
});
player.addEventListener('keydown', (e) => { if (e.key === 'Escape') setTab('code'); });

// ---- examples ----
const sel = $('#examples');
const exampleSlug = (ex) => ex.id || ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function exampleFromHash() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase(); } catch (_) { return null; }
  return EXAMPLES.find(ex => exampleSlug(ex) === id) || null;
}
function setExampleHash(id, replace = false) {
  const url = new URL(location.href);
  url.hash = id;
  if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](history.state, '', url);
}
function showExample(ex) {
  progName = ex.name; progSrc = ex.src;
  swfName = exampleSlug(ex);
  sel.value = String(EXAMPLES.indexOf(ex));
  setSource(ex.src);
  showName();
}
sel.innerHTML = '<option value="">examples…</option>' + EXAMPLES.map((ex, i) => `<option value="${i}">${esc(ex.name)}</option>`).join('');
sel.addEventListener('change', () => {
  const ex = EXAMPLES[sel.value];
  if (!ex) return;
  setExampleHash(exampleSlug(ex));
  showExample(ex);
  run(true);
});
// LOADER ["name"] in BASIC is getURL('#name', '_self'), so it arrives here as a hash change.
window.addEventListener('hashchange', () => {
  const ex = exampleFromHash();
  if (!ex) return;
  showExample(ex);
  run(true);
});

// ---- open .bas / .tap ----
$('#open').addEventListener('click', () => $('#openfile').click());
$('#openfile').addEventListener('change', async () => {
  const f = $('#openfile').files[0];
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  let text;
  if (/\.tap$/i.test(f.name) || (bytes[0] === 0x13 && bytes[1] === 0 && bytes[2] === 0)) {
    const parts = tapToListing(bytes);
    const progs = parts.filter(p => p.listing !== undefined);
    const others = parts.filter(p => p.listing === undefined);
    if (!progs.length) { showError(new Error('No BASIC program block in this tape')); return; }
    text = progs.map(p => p.listing).join('\n');
    if (others.length) text = `1 REM ${f.name}: tape also holds ${others.map(o => `${o.type} "${o.name}" (${o.length} bytes at ${o.address})`).join(', ')}\n` + text;
  } else text = new TextDecoder().decode(bytes);
  setExampleHash('', true);
  progName = f.name; progSrc = text;
  swfName = f.name.replace(/\.[^.]+$/, '');
  sel.value = '';
  setSource(text);
  showName();
  run(true);
  $('#openfile').value = '';
});

// ---- boot ----
let initial = null, initialEx = '';
try { initial = localStorage.getItem(STORE); initialEx = localStorage.getItem(STORE_EX) || ''; } catch (_) { /* ignore */ }
{ // an unedited example always comes back as its current version, so updates to the examples show up
  const ex = exampleFromHash() || EXAMPLES.find(e => e.name === initialEx) || (initial ? EXAMPLES.find(e => e.src === initial) : EXAMPLES[0]);
  if (ex) showExample(ex);
  else setSource(initial || EXAMPLES[0].src);
  showName();
}
setTab('screen');
run(true);
window.zxflash = { editor, player, run, buildProgram, setTab };
