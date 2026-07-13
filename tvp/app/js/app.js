/*
 * TVP/2007 — a Joost-era web TV revival (original code).
 *
 * The conceit: channels run on a wall clock anchored to 16 Jan 2007.
 * You never "open a file" — you tune a channel and join whatever is
 * on right now, exactly like the old client (and old television).
 *
 * Playback is double-buffered: one <video> is on the air while the other
 * quietly preloads whatever the schedule says is next, so program
 * transitions are seamless and channel zaps from the guide are warm.
 */

"use strict";

/* ── tiny helpers ──────────────────────────────────── */

const $ = (id) => document.getElementById(id);

const fmt = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
};
const clock12 = (d) => {
  let h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
};

const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem("tvp." + k); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem("tvp." + k, JSON.stringify(v)); } catch {} }
};

/* ── broadcast scheduler ───────────────────────────── */

function channelTotal(ch) {
  return ch.programs.reduce((s, p) => s + p.dur, 0);
}

/* What is on channel `ch` at time `atMs`? */
function scheduleFor(ch, atMs = Date.now()) {
  const total = channelTotal(ch);
  let t = ((atMs - BROADCAST_EPOCH) / 1000) % total;
  for (let i = 0; i < ch.programs.length; i++) {
    const p = ch.programs[i];
    if (t < p.dur) return { index: i, offset: t, remaining: p.dur - t, program: p };
    t -= p.dur;
  }
  return { index: 0, offset: 0, remaining: ch.programs[0].dur, program: ch.programs[0] };
}

/* Upcoming listing: current program + the next few, with start times. */
function listingFor(ch, count = 5) {
  const now = Date.now();
  const sched = scheduleFor(ch, now);
  const out = [];
  let startMs = now - sched.offset * 1000;
  let idx = sched.index;
  for (let i = 0; i < Math.min(count, ch.programs.length); i++) {
    const p = ch.programs[idx];
    out.push({ program: p, index: idx, startMs, live: i === 0 });
    startMs += p.dur * 1000;
    idx = (idx + 1) % ch.programs.length;
  }
  return out;
}

/* ── state ─────────────────────────────────────────── */

const state = {
  on: false,
  chIndex: Math.min(store.get("channel", 0), CHANNELS.length - 1),
  onDemand: null,          // {chIndex, progIndex} when playing from start
  favs: new Set(store.get("favs", [])),
  ratings: store.get("ratings", {}),
  quality: store.get("quality", "fast"),
  category: "explore",
  overlayTimer: null,
  comingUpShown: false,
  digitBuffer: "",
  digitTimer: null,
  tuneToken: 0,
  zapQuiet: false,
  guideIndex: 0,           // channel index centered in the guide rail
  pins: store.get("pins", {})
};

/* ── the double-buffered video pair ────────────────── */

let video = $("tv-a");            // on the air
let backstage = $("tv-b");        // preloading what's next
let userVolume = 1, userMuted = false;

/* Optional CDN mirror of archive.org/download/ (e.g. a Cloudflare Worker
 * or R2 bucket). Set once from the console and reload:
 *   localStorage.setItem('tvp.mirror', JSON.stringify('https://tv.example.com/ia/'))
 */
const MIRROR = store.get("mirror", "");
const mirror = (u) => (MIRROR && u) ? u.replace("https://archive.org/download/", MIRROR) : u;

/* Everything tunes on the light ~512kbps derivative so channels start
 * fast; when quality is "best" we quietly upgrade a few seconds in via
 * the backstage element (the "start low, finish high" trick). */
function fastSrc(p) { return mirror(p.src); }
function bestSrc(p) { return p.srcHi ? mirror(p.srcHi) : null; }

function applySound(el) { el.volume = userVolume; el.muted = userMuted; }

function swapStage() {
  const old = video;
  video = backstage;
  backstage = old;
  applySound(video);
  video.classList.remove("hidden");
  old.classList.add("hidden");
  old.pause();
  // free the old buffer once the swap has settled
  setTimeout(() => {
    if (old !== video) { old.removeAttribute("src"); delete old.dataset.src; old.load(); }
  }, 1000);
}

/* preload a stream into the backstage element (muted, hidden) */
function preloadBackstage(src, offset = 0) {
  if (backstage.dataset.src === src) return;
  backstage.dataset.src = src;
  backstage.dataset.offset = String(offset);
  backstage.muted = true;
  backstage.src = src;
  if (offset > 1) {
    backstage.addEventListener("loadedmetadata", function seekOnce() {
      if (backstage.dataset.src === src) { try { backstage.currentTime = offset; } catch {} }
    }, { once: true });
  }
  backstage.load();
}

function backstageReadyFor(src) {
  return backstage.dataset.src === src && backstage.readyState >= 2;
}

/* ── CRT power effect ──────────────────────────────── */

function crt(mode, done) {
  const el = $("crt");
  el.classList.remove("on", "off");
  void el.offsetWidth;
  el.classList.add(mode);
  const ms = mode === "off" ? 460 : 520;
  setTimeout(() => { el.classList.remove(mode); done && done(); }, ms);
}

function crtBlink() {
  const el = $("crt");
  el.classList.remove("on", "off");
  void el.offsetWidth;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 300);
}

/* ── tuning ────────────────────────────────────────── */

function currentChannel() { return CHANNELS[state.chIndex]; }

function currentProgramInfo() {
  const ch = currentChannel();
  if (state.onDemand && state.onDemand.chIndex === state.chIndex) {
    const p = ch.programs[state.onDemand.progIndex];
    return { program: p, index: state.onDemand.progIndex, live: false };
  }
  const s = scheduleFor(ch);
  return { program: s.program, index: s.index, live: true, offset: s.offset, remaining: s.remaining };
}

function tune(chIndex, opts = {}) {
  state.chIndex = ((chIndex % CHANNELS.length) + CHANNELS.length) % CHANNELS.length;
  store.set("channel", state.chIndex);
  const ch = currentChannel();
  const token = ++state.tuneToken;

  let progIndex, offset;
  if (opts.fromStartProg !== undefined) {
    state.onDemand = { chIndex: state.chIndex, progIndex: opts.fromStartProg };
    progIndex = opts.fromStartProg;
    offset = 0;
  } else {
    state.onDemand = null;
    const s = scheduleFor(ch);
    progIndex = s.index;
    offset = s.offset;
  }
  const prog = ch.programs[progIndex];
  const src = fastSrc(prog);

  state.comingUpShown = false;
  $("comingup").classList.add("hidden");
  // arm the quality upgrade for this tune, if wanted and available
  state.upgrade = (state.quality === "best" && bestSrc(prog))
    ? { url: bestSrc(prog), token } : null;

  const arrive = () => {
    if (token !== state.tuneToken) return;
    $("interstitial").classList.add("hidden");
    updateInfo();
    if (state.zapQuiet) { state.zapQuiet = false; showOSDChannel(); }
    else showOverlays();
  };

  /* warm path: the backstage element already buffered this stream */
  if (backstageReadyFor(src) && opts.fromStartProg === undefined) {
    swapStage();
    const drift = Math.abs((video.currentTime || 0) - offset);
    if (drift > 4 && offset < prog.dur - 2) { try { video.currentTime = offset; } catch {} }
    const p = video.play();
    if (p) p.catch(() => {});
    arrive();
    updateAncillary(ch, prog);
    return;
  }

  /* cold path: interstitial while the active element loads */
  $("interstitial-text").textContent = "Fetching your channel…";
  $("interstitial-channel").textContent = ch.num + " · " + ch.name;
  $("interstitial").classList.remove("hidden");

  video.dataset.src = src;
  video.src = src;
  video.addEventListener("loadedmetadata", () => {
    if (token !== state.tuneToken) return;
    if (offset > 1 && offset < prog.dur - 2) {
      try { video.currentTime = offset; } catch {}
    }
  }, { once: true });
  video.addEventListener("playing", arrive, { once: true });

  const p = video.play();          // keep the user gesture
  if (p) p.catch(() => {});

  updateInfo();
  updateAncillary(ch, prog);
}

function updateAncillary(ch, prog) {
  renderGuideList();
  renderJewels();
  chatOnZap(ch, prog);
}

function zap(delta) {
  state.zapQuiet = !overlaysVisible();
  crtBlink();
  tune(state.chIndex + delta);
}

/* program end → seamless advance via the preloaded backstage element */
function onProgramEnded(e) {
  if (e.target !== video || !state.on) return;
  state.onDemand = null;
  const s = scheduleFor(currentChannel());
  if (backstageReadyFor(fastSrc(s.program))) {
    state.zapQuiet = true;          // no interstitial, just roll on
  }
  tune(state.chIndex);
}

function onVideoError(e) {
  if (e.target !== video || !state.on) return;
  $("interstitial-text").textContent = "Channel hiccup — re-tuning…";
  $("interstitial").classList.remove("hidden");
  const tk = state.tuneToken;
  setTimeout(() => { if (state.on && tk === state.tuneToken) tune(state.chIndex); }, 3500);
}

[$("tv-a"), $("tv-b")].forEach((el) => {
  el.addEventListener("ended", onProgramEnded);
  el.addEventListener("error", onVideoError);
  el.addEventListener("play", (e) => { if (e.target === video) { $("glyph-play").classList.add("hidden"); $("glyph-pause").classList.remove("hidden"); } });
  el.addEventListener("pause", (e) => { if (e.target === video) { $("glyph-pause").classList.add("hidden"); $("glyph-play").classList.remove("hidden"); } });
});

/* ── overlays: info bar + controller ───────────────── */

function updateInfo() {
  const ch = currentChannel();
  const info = currentProgramInfo();
  const p = info.program;
  $("info-channel").textContent = ch.num + " · " + ch.name;
  $("info-title").textContent = p.title + (p.year ? " (" + p.year + ")" : "");
  const liveTxt = info.live
    ? "LIVE · ends " + clock12(new Date(Date.now() + (info.remaining || 0) * 1000))
    : "on demand · from the start";
  $("info-meta").textContent = liveTxt + " · " + (p.license || "");
  $("info-art").src = p.art || ch.art;
  $("time-total").textContent = fmt(p.dur);

  // expanded panel
  $("info-desc").textContent = p.desc || ch.tagline || "";
  $("info-facts").textContent =
    [(p.year ? "first shown " + p.year : null), fmt(p.dur), p.license].filter(Boolean).join(" · ");
  const sched = $("info-sched");
  sched.innerHTML = "";
  listingFor(ch, 4).forEach((slot) => {
    const row = document.createElement("div");
    row.className = "sched-row" + (slot.live ? " now" : "");
    row.innerHTML = `<span class="t">${clock12(new Date(slot.startMs))}</span>
      <span class="n">${slot.program.title}</span>${slot.live ? '<span class="live-tag">LIVE</span>' : ""}`;
    sched.appendChild(row);
  });
  $("info-fav").classList.toggle("lit", state.favs.has(ch.id));

  // source attribution: link the program's own archive.org details page
  const item = (p.src || "").match(/archive\.org\/download\/([^/]+)\//);
  if (item) {
    $("info-source").href = "https://archive.org/details/" + item[1];
    $("info-source").classList.remove("hidden");
  } else {
    $("info-source").classList.add("hidden");
  }
}

function overlaysVisible() { return !$("controller").classList.contains("hidden"); }

function showOverlays() {
  $("osd-channel").classList.add("hidden");
  $("controller").classList.remove("hidden");
  $("infobar").classList.remove("hidden");
  if (matchMedia("(hover:hover)").matches) $("volume").classList.remove("hidden");
  armOverlayTimer();
}
function hideOverlays() {
  $("controller").classList.add("hidden");
  $("infobar").classList.add("hidden");
  $("infobar").classList.remove("expanded");
  $("volume").classList.add("hidden");
}
function armOverlayTimer() {
  clearTimeout(state.overlayTimer);
  state.overlayTimer = setTimeout(() => {
    if (!video.paused && !$("infobar").classList.contains("expanded")) hideOverlays();
    else armOverlayTimer();
  }, 4500);
}
function toggleOverlays() { overlaysVisible() ? hideOverlays() : showOverlays(); }

$("info-expand").addEventListener("click", () => {
  $("infobar").classList.toggle("expanded");
  if ($("infobar").classList.contains("expanded")) updateInfo();
  armOverlayTimer();
});

/* the half-second heartbeat: progress, coming-up, preload-next */
setInterval(() => {
  if (!state.on) return;
  const info = currentProgramInfo();
  const dur = info.program.dur;
  const t = video.currentTime || 0;
  $("time-now").textContent = fmt(t);
  const pct = Math.min(100, (t / dur) * 100);
  $("progress-fill").style.width = pct + "%";
  $("progress-handle").style.left = pct + "%";

  const remaining = dur - t;

  /* backstage priorities, most urgent first:
     1. the junction — stage the next program ~45s out
     2. the quality upgrade — swap fast → best a few seconds in
     3. idle warmth — buffer the next channel up the dial for instant zaps */
  if (remaining < 45 && remaining > 2 && !video.paused) {
    state.upgrade = null;   // too late to bother upgrading this one
    const next = listingFor(currentChannel(), 2)[1];
    if (next) preloadBackstage(fastSrc(next.program), 0);
  } else if (state.upgrade && state.upgrade.token === state.tuneToken &&
             t > 8 && remaining > 90 && !video.paused && video.readyState >= 3) {
    if (backstage.dataset.src !== state.upgrade.url) {
      preloadBackstage(state.upgrade.url, t + 10);
    } else if (backstageReadyFor(state.upgrade.url)) {
      const at = video.currentTime;
      swapStage();
      try { video.currentTime = at + 0.2; } catch {}
      const pl = video.play();
      if (pl) pl.catch(() => {});
      state.upgrade = null;
    }
  } else if (!state.upgrade && t > 15 && remaining > 60 && !video.paused && CHANNELS.length > 1) {
    const nx = CHANNELS[(state.chIndex + 1) % CHANNELS.length];
    const s = scheduleFor(nx);
    preloadBackstage(fastSrc(s.program), s.offset);
  }

  // "coming up" ~25s before the end of the current program
  if (remaining < 25 && remaining > 3 && !state.comingUpShown && !video.paused) {
    state.comingUpShown = true;
    const next = listingFor(currentChannel(), 2)[1] || listingFor(currentChannel(), 1)[0];
    $("comingup-title").textContent = next.program.title;
    $("comingup").classList.remove("hidden");
    setTimeout(() => $("comingup").classList.add("hidden"), 8000);
  }
  if (remaining >= 25) state.comingUpShown = false;

  // time-machine readout
  $("jump-readout").textContent = fmt(t) + " / " + fmt(dur);
  if (!state.jumpDragging) $("jump-frac").value = String(Math.round((t / dur) * 1000));

  if (overlaysVisible()) updateInfo();
}, 500);

/* seek on the progress bar */
(function wireSeek() {
  const bar = $("progress");
  const seekTo = (clientX) => {
    const r = bar.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const info = currentProgramInfo();
    video.currentTime = frac * info.program.dur;
  };
  let dragging = false;
  bar.addEventListener("pointerdown", (e) => { dragging = true; bar.setPointerCapture(e.pointerId); seekTo(e.clientX); armOverlayTimer(); });
  bar.addEventListener("pointermove", (e) => { if (dragging) seekTo(e.clientX); });
  bar.addEventListener("pointerup", () => { dragging = false; });
})();

/* ── OSD ───────────────────────────────────────────── */

let osdTimer;
function showOSDChannel() {
  if (overlaysVisible()) return;   // the info bar already names the channel
  const ch = currentChannel();
  $("osd-num").textContent = ch.num;
  $("osd-name").textContent = ch.name;
  $("osd-channel").classList.remove("hidden");
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => $("osd-channel").classList.add("hidden"), 2600);
}

let volTimer;
function showOSDVolume() {
  const bar = $("osd-volume-bar").firstElementChild;
  bar.style.width = (userMuted ? 0 : userVolume * 100) + "%";
  $("osd-volume").classList.remove("hidden");
  clearTimeout(volTimer);
  volTimer = setTimeout(() => $("osd-volume").classList.add("hidden"), 1400);
}

/* ── controller buttons ────────────────────────────── */

$("btn-play").addEventListener("click", () => {
  if (video.paused) video.play(); else video.pause();
  armOverlayTimer();
});

$("btn-prev").addEventListener("click", () => zap(-1));
$("btn-next").addEventListener("click", () => zap(+1));

$("btn-mute").addEventListener("click", () => {
  userMuted = !userMuted;
  applySound(video);
  $("spk-wave").style.opacity = userMuted ? 0 : 1;
  $("btn-mute").classList.toggle("lit", userMuted);
  showOSDVolume();
  armOverlayTimer();
});

$("volume").addEventListener("input", (e) => {
  userVolume = parseFloat(e.target.value);
  userMuted = false;
  applySound(video);
  showOSDVolume();
});

$("btn-fs").addEventListener("click", () => {
  const root = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (root.requestFullscreen) root.requestFullscreen();
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
  armOverlayTimer();
});

$("btn-menu").addEventListener("click", () => openPanel("guide"));
$("btn-widgets").addEventListener("click", () => openPanel("dock"));
$("btn-search").addEventListener("click", () => openPanel("search"));

$("btn-power").addEventListener("click", powerOff);

$("info-restart").addEventListener("click", () => {
  const info = currentProgramInfo();
  tune(state.chIndex, { fromStartProg: info.index });
});
$("info-live").addEventListener("click", () => { crtBlink(); tune(state.chIndex); });
$("info-fav").addEventListener("click", () => {
  const ch = currentChannel();
  state.favs.has(ch.id) ? state.favs.delete(ch.id) : state.favs.add(ch.id);
  store.set("favs", [...state.favs]);
  updateInfo();
});

/* ── power ─────────────────────────────────────────── */

function powerOn() {
  state.on = true;
  $("splash").classList.add("hidden");
  crt("on");
  tune(state.chIndex);
  startClock();
  startTicker();
  restorePins();
}

function powerOff() {
  state.on = false;
  hideOverlays();
  closePanels();
  crt("off", () => {
    [video, backstage].forEach((el) => {
      el.pause(); el.removeAttribute("src"); delete el.dataset.src; el.load();
    });
    $("interstitial").classList.add("hidden");
    $("splash").classList.remove("hidden");
  });
}

$("power-on").addEventListener("click", powerOn);

/* ── panels: guide / dock / search ─────────────────── */

function openPanel(which) {
  closePanels();
  hideOverlays();
  $("osd-channel").classList.add("hidden");
  if (which === "guide") {
    state.guideIndex = state.chIndex;
    $("guide").classList.add("open");
    renderGuideCats();
    renderGuideRail();
    renderGuideList();
    requestAnimationFrame(() => centerGuideTile(state.chIndex, "instant"));
  } else if (which === "search") {
    $("search").classList.add("open");
    renderSearch($("search-input").value);
    setTimeout(() => $("search-input").focus(), 250);
    document.body.classList.add("drawer-open");
  } else {
    $(which).classList.add("open");
    document.body.classList.add("drawer-open");
  }
}
function closePanels() {
  ["dock", "search", "guide"].forEach((id) => $(id).classList.remove("open"));
  document.body.classList.remove("drawer-open");
}
$("scrim").addEventListener("click", closePanels);
document.querySelectorAll(".drawer-close").forEach((b) =>
  b.addEventListener("click", () => closePanels()));

/* ── THE GUIDE: swoosh rail ────────────────────────── */

function channelsInCategory() {
  if (state.category === "explore") return CHANNELS;
  if (state.category === "my") return CHANNELS.filter((ch) => state.favs.has(ch.id));
  return CHANNELS.filter((ch) => ch.category === state.category);
}

function renderGuideCats() {
  const nav = $("guide-cats");
  nav.innerHTML = "";
  EPG_CATEGORIES.forEach((c) => {
    const has = c.id === "explore" || c.id === "my" || CHANNELS.some((ch) => ch.category === c.id);
    if (!has) return;
    const b = document.createElement("button");
    b.className = "cat" + (state.category === c.id ? " active" : "");
    b.textContent = c.label;
    b.addEventListener("click", () => {
      state.category = c.id;
      renderGuideCats();
      renderGuideRail();
    });
    nav.appendChild(b);
  });
}

function renderGuideRail() {
  const rail = $("guide-rail");
  rail.innerHTML = "";
  const chans = channelsInCategory();
  if (!chans.length) {
    $("guide-list").innerHTML =
      '<div class="search-empty">No channels here yet — tap ★ on a channel to add it to My Channels.</div>';
    return;
  }
  chans.forEach((ch, i) => {
    const s = scheduleFor(ch);
    const tile = document.createElement("div");
    tile.className = "tile" + (CHANNELS[state.chIndex] === ch ? " playing" : "");
    tile.style.setProperty("--i", i);
    tile.dataset.ch = String(CHANNELS.indexOf(ch));
    tile.innerHTML = `
      <img src="${s.program.art || ch.art}" alt="" loading="lazy">
      <div class="tile-label">
        <div class="tile-name"><span class="chnum">${ch.num}</span><span>${ch.name}</span></div>
        <div class="tile-now">Now: ${s.program.title}</div>
        <div class="tile-progress"><div style="width:${Math.round((s.offset / s.program.dur) * 100)}%"></div></div>
      </div>`;
    tile.addEventListener("click", () => {
      const chIdx = parseInt(tile.dataset.ch, 10);
      if (!tile.classList.contains("center")) { centerGuideTile(chIdx); return; }
      closePanels(); crtBlink(); tune(chIdx);
    });
    rail.appendChild(tile);
  });
  requestAnimationFrame(updateRailFocus);
}

function centerGuideTile(chIdx, behavior = "smooth") {
  const rail = $("guide-rail");
  const tile = [...rail.children].find((t) => parseInt(t.dataset.ch, 10) === chIdx);
  if (!tile) { if (rail.firstChild) rail.firstChild.scrollIntoView({ inline: "center", behavior }); return; }
  const target = tile.offsetLeft + tile.offsetWidth / 2 - rail.clientWidth / 2;
  rail.scrollTo({ left: target, behavior });
}

/* scale tiles by distance from center; detect the focused channel */
let railRaf = null, railSettle = null;
function updateRailFocus() {
  const rail = $("guide-rail");
  if (!$("guide").classList.contains("open")) return;
  const mid = rail.getBoundingClientRect().left + rail.clientWidth / 2;
  let best = null, bestD = Infinity;
  [...rail.children].forEach((tile) => {
    const r = tile.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - mid);
    const norm = Math.min(1, d / (rail.clientWidth * 0.55));
    tile.style.transform = `scale(${1.04 - norm * 0.22})`;
    tile.style.opacity = String(1 - norm * 0.35);
    tile.classList.toggle("center", d < r.width * 0.5);
    if (d < bestD) { bestD = d; best = tile; }
  });
  if (best) {
    const idx = parseInt(best.dataset.ch, 10);
    if (idx !== state.guideIndex) {
      state.guideIndex = idx;
      renderGuideList();
      // warm-preload the focused channel's live stream for instant zap
      clearTimeout(railSettle);
      railSettle = setTimeout(() => {
        if (state.guideIndex === idx && idx !== state.chIndex) {
          const s = scheduleFor(CHANNELS[idx]);
          preloadBackstage(fastSrc(s.program), s.offset);
        }
      }, 450);
    }
  }
}
$("guide-rail").addEventListener("scroll", () => {
  if (railRaf) return;
  railRaf = requestAnimationFrame(() => { railRaf = null; updateRailFocus(); });
}, { passive: true });

function renderGuideList() {
  if (!$("guide").classList.contains("open")) return;
  const box = $("guide-list");
  const ch = CHANNELS[state.guideIndex] || currentChannel();
  box.innerHTML = "";

  const head = document.createElement("div");
  head.className = "gl-head";
  head.innerHTML = `<div class="gl-title">${ch.name}<small>${ch.tagline || ch.category}</small></div>`;
  const fav = document.createElement("button");
  fav.className = "fav-btn" + (state.favs.has(ch.id) ? " on" : "");
  fav.textContent = "★";
  fav.title = "My Channels";
  fav.addEventListener("click", () => {
    state.favs.has(ch.id) ? state.favs.delete(ch.id) : state.favs.add(ch.id);
    store.set("favs", [...state.favs]);
    fav.classList.toggle("on");
    if (state.category === "my") renderGuideRail();
  });
  head.appendChild(fav);
  box.appendChild(head);

  listingFor(ch, 6).forEach((slot) => {
    const row = document.createElement("div");
    row.className = "gl-row" + (slot.live ? " now" : "");
    row.innerHTML = `<span class="t">${clock12(new Date(slot.startMs))}</span>
      <span class="n">${slot.program.title}${slot.program.year ? " <small>(" + slot.program.year + ")</small>" : ""}</span>
      ${slot.live ? '<span class="live-tag">LIVE</span>' : ""}`;
    row.addEventListener("click", () => {
      closePanels(); crtBlink();
      const chIdx = CHANNELS.indexOf(ch);
      if (slot.live) tune(chIdx);
      else tune(chIdx, { fromStartProg: slot.index });
    });
    box.appendChild(row);
  });
}

/* ── search ────────────────────────────────────────── */

function renderSearch(q) {
  const box = $("search-results");
  q = (q || "").trim().toLowerCase();
  box.innerHTML = "";
  if (!q) {
    box.innerHTML = '<div class="search-empty">Try “bunny”, “zombie”, “noir”, “moon”…</div>';
    return;
  }
  let hits = 0;
  CHANNELS.forEach((ch) => {
    ch.programs.forEach((p, pi) => {
      if (hits >= 40) return;
      const hay = (ch.name + " " + p.title + " " + (p.desc || "") + " " + ch.category).toLowerCase();
      if (!hay.includes(q)) return;
      hits++;
      const live = scheduleFor(ch).index === pi;
      const el = document.createElement("div");
      el.className = "sr";
      el.innerHTML = `<img src="${p.art || ch.art}" alt="" loading="lazy">
        <div><div class="sr-title">${p.title}${p.year ? " (" + p.year + ")" : ""}</div>
        <div class="sr-sub">${ch.num} · ${ch.name}${live ? ' · <span class="onair">ON AIR</span>' : " · plays from start"}</div></div>`;
      el.addEventListener("click", () => {
        closePanels(); crtBlink();
        live ? tune(CHANNELS.indexOf(ch)) : tune(CHANNELS.indexOf(ch), { fromStartProg: pi });
      });
      box.appendChild(el);
    });
  });
  if (!hits) box.innerHTML = `<div class="search-empty">Your search for “${q}” did not match any programs.</div>`;
}
$("search-input").addEventListener("input", (e) => renderSearch(e.target.value));
$("search-form").addEventListener("submit", (e) => e.preventDefault());

/* ── widgets: pinning (plugins that stay on screen) ── */

const dockSlots = new Map();   // widget id -> placeholder comment node

function setPinButtonState(sec) {
  const btn = sec.querySelector(".w-pin");
  if (btn) {
    btn.classList.toggle("on", sec.classList.contains("pinned"));
    btn.title = sec.classList.contains("pinned") ? "Return to dock" : "Pin over the picture";
  }
}

function pinWidget(sec, pos) {
  if (sec.classList.contains("pinned")) return;
  const ph = document.createComment("slot:" + sec.id);
  sec.parentNode.insertBefore(ph, sec);
  dockSlots.set(sec.id, ph);
  $("pinned-layer").appendChild(sec);
  sec.classList.add("pinned");
  const layer = $("pinned-layer").getBoundingClientRect();
  const n = $("pinned-layer").children.length - 1;
  const x = pos?.x ?? Math.min(12 + n * 26, Math.max(8, layer.width - 300));
  const y = pos?.y ?? 70 + n * 34;
  sec.style.left = Math.max(0, Math.min(x, layer.width - 120)) + "px";
  sec.style.top = Math.max(0, Math.min(y, layer.height - 80)) + "px";
  setPinButtonState(sec);
  savePins();
}

function unpinWidget(sec) {
  if (!sec.classList.contains("pinned")) return;
  sec.classList.remove("pinned");
  sec.style.left = sec.style.top = "";
  const ph = dockSlots.get(sec.id);
  if (ph && ph.parentNode) { ph.parentNode.insertBefore(sec, ph); ph.remove(); }
  else $("dock").appendChild(sec);
  dockSlots.delete(sec.id);
  setPinButtonState(sec);
  savePins();
}

function savePins() {
  const pins = {};
  document.querySelectorAll(".widget.pinned").forEach((sec) => {
    pins[sec.id] = { x: parseInt(sec.style.left, 10) || 0, y: parseInt(sec.style.top, 10) || 0 };
  });
  state.pins = pins;
  store.set("pins", pins);
}

function restorePins() {
  Object.entries(state.pins || {}).forEach(([id, pos]) => {
    const sec = $(id);
    if (sec) pinWidget(sec, pos);
  });
}

/* dress every widget header with a pin toggle + drag behavior */
document.querySelectorAll(".widget").forEach((sec) => {
  const h3 = sec.querySelector("h3");
  const title = document.createElement("span");
  title.className = "w-title";
  while (h3.firstChild) title.appendChild(h3.firstChild);
  h3.appendChild(title);
  const pin = document.createElement("button");
  pin.className = "w-pin";
  pin.innerHTML = "&#8865;";
  pin.title = "Pin over the picture";
  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    sec.classList.contains("pinned") ? unpinWidget(sec) : pinWidget(sec);
  });
  h3.appendChild(pin);

  // drag when pinned
  let drag = null;
  h3.addEventListener("pointerdown", (e) => {
    if (!sec.classList.contains("pinned") || e.target === pin) return;
    drag = { dx: e.clientX - sec.offsetLeft, dy: e.clientY - sec.offsetTop };
    sec.classList.add("dragging");
    try { h3.setPointerCapture(e.pointerId); } catch {}
  });
  h3.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const layer = $("pinned-layer").getBoundingClientRect();
    sec.style.left = Math.max(0, Math.min(e.clientX - drag.dx, layer.width - 60)) + "px";
    sec.style.top = Math.max(0, Math.min(e.clientY - drag.dy, layer.height - 40)) + "px";
  });
  h3.addEventListener("pointerup", () => {
    if (drag) { drag = null; sec.classList.remove("dragging"); savePins(); }
  });
});

/* ── widgets: clock ────────────────────────────────── */

function startClock() {
  const cv = $("clock-canvas");
  const ctx = cv.getContext("2d");
  const draw = () => {
    const d = new Date();
    const w = cv.width, c = w / 2;
    ctx.clearRect(0, 0, w, w);
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c, c, c - 4, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.lineWidth = i % 3 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * (c - 8), c - Math.cos(a) * (c - 8));
      ctx.lineTo(c + Math.sin(a) * (c - 14), c - Math.cos(a) * (c - 14));
      ctx.stroke();
    }
    const hands = [
      { v: ((d.getHours() % 12) + d.getMinutes() / 60) / 12, len: .5, wid: 4.5, col: "#fff" },
      { v: (d.getMinutes() + d.getSeconds() / 60) / 60, len: .72, wid: 3, col: "#fff" },
      { v: d.getSeconds() / 60, len: .8, wid: 1.5, col: "rgb(198,96,12)" }
    ];
    hands.forEach((h) => {
      const a = h.v * Math.PI * 2;
      ctx.strokeStyle = h.col; ctx.lineWidth = h.wid; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c, c);
      ctx.lineTo(c + Math.sin(a) * c * h.len, c - Math.cos(a) * c * h.len);
      ctx.stroke();
    });
    ctx.fillStyle = "rgb(198,96,12)";
    ctx.beginPath(); ctx.arc(c, c, 4, 0, Math.PI * 2); ctx.fill();
    $("clock-digital").textContent = clock12(d);
  };
  draw();
  setInterval(draw, 1000);
}

/* ── widgets: time machine (seek plugin) ───────────── */

document.querySelectorAll("#jump-buttons [data-jump]").forEach((b) =>
  b.addEventListener("click", () => {
    video.currentTime = Math.max(0, (video.currentTime || 0) + parseFloat(b.dataset.jump));
  }));
$("jump-frac").addEventListener("pointerdown", () => { state.jumpDragging = true; });
$("jump-frac").addEventListener("change", () => { state.jumpDragging = false; });
$("jump-frac").addEventListener("input", (e) => {
  const info = currentProgramInfo();
  video.currentTime = (parseInt(e.target.value, 10) / 1000) * info.program.dur;
});
$("jump-live").addEventListener("click", () => { crtBlink(); tune(state.chIndex); });

/* ── widgets: ratings jewels ───────────────────────── */

function progKey() {
  const info = currentProgramInfo();
  return currentChannel().id + "::" + info.program.title;
}

function renderJewels() {
  const box = $("jewels");
  box.innerHTML = "";
  const val = state.ratings[progKey()] || 0;
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.className = "jewel" + (i <= val ? " on" : "");
    b.textContent = "◆";
    b.addEventListener("click", () => {
      state.ratings[progKey()] = i;
      store.set("ratings", state.ratings);
      renderJewels();
      $("jewel-caption").textContent = ["", "hmm.", "ok.", "good.", "great!", "instant classic!"][i];
    });
    box.appendChild(b);
  }
  const v = state.ratings[progKey()];
  $("jewel-caption").textContent = v ? "you rated this " + v + "/5" : "tap a jewel";
}

/* ── widgets: quality ──────────────────────────────── */

function renderQuality() {
  $("quality-toggle").textContent =
    state.quality === "best" ? "quality: best — tap for fast" : "quality: fast — tap for best";
}
$("quality-toggle").addEventListener("click", () => {
  state.quality = state.quality === "best" ? "fast" : "best";
  store.set("quality", state.quality);
  renderQuality();
  // no re-tune needed: "best" arms a seamless mid-play upgrade
  if (state.on && state.quality === "best") {
    const info = currentProgramInfo();
    const hi = bestSrc(info.program);
    if (hi) state.upgrade = { url: hi, token: state.tuneToken };
  } else {
    state.upgrade = null;
  }
});

/* ── widgets: channel chat (a friendly séance) ─────── */

const CHAT_BOTS = ["venice_fan", "p2p_pete", "beta_tester07", "couch_potato", "sleepy_llama", "dialup_dora"];
const CHAT_LINES = [
  "anyone else watching {show}? ☺",
  "this channel is my new favourite",
  "wow, {show} looks great tonight",
  "greetings from 2007! my invite token finally arrived",
  "brb, buffering",
  "you can pin this chat over the picture now →",
  "does anyone have spare invites?",
  "watching this on the couch via wifi. the future!",
  "{show} again?! ...ok fine, staying",
  "the coming-up overlay says something good is next",
  "channel {num} crew, sound off ♫",
  "quality looks better than cable tbh"
];
let chatTimer;

function chatPush(name, text, cls) {
  const log = $("chat-log");
  const el = document.createElement("div");
  el.className = "chat-msg" + (cls ? " " + cls : "");
  if (name) { const b = document.createElement("b"); b.textContent = name + ": "; el.appendChild(b); }
  el.appendChild(document.createTextNode(text));
  log.appendChild(el);
  while (log.children.length > 40) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function chatOnZap(ch, prog) {
  $("chat-log").innerHTML = "";
  chatPush(null, "joined #" + ch.id + " — " + (3 + ((ch.num * 7) % 9)) + " viewers here", "sys");
  scheduleChat();
}

function scheduleChat() {
  clearTimeout(chatTimer);
  const delay = 9000 + Math.random() * 14000;
  chatTimer = setTimeout(() => {
    if (state.on) {
      const ch = currentChannel();
      const info = currentProgramInfo();
      const line = CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)]
        .replace("{show}", info.program.title)
        .replace("{num}", ch.num);
      chatPush(CHAT_BOTS[Math.floor(Math.random() * CHAT_BOTS.length)], line);
    }
    scheduleChat();
  }, delay);
}

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("chat-input").value.trim();
  if (!v) return;
  chatPush("you", v, "me");
  $("chat-input").value = "";
  setTimeout(() => {
    if (state.on) chatPush(CHAT_BOTS[Math.floor(Math.random() * CHAT_BOTS.length)], "^ agreed ☺");
  }, 2500 + Math.random() * 3000);
});

/* ── widgets: news ticker ──────────────────────────── */

const TICKER_ITEMS = [
  "<b>ON THIS NETWORK:</b> " + CHANNELS.length + " channels of free &amp; open video from archive.org",
  "<b>2007:</b> a phone with no keyboard is announced in January; pundits unconvinced",
  "<b>BLENDER:</b> the open movies on channels 1 &amp; 2 are CC-BY — remix them!",
  "<b>TIP:</b> press 1–" + Math.min(9, CHANNELS.length) + " on a keyboard to zap straight to a channel",
  "<b>TIP:</b> swipe from the left edge for the guide, right edge for widgets",
  "<b>TIP:</b> pin a widget (⊡) and it stays floating over the picture",
  "<b>NOSTALGIA:</b> no P2P engine was harmed in this reconstruction"
];

function startTicker() {
  const on = store.get("ticker", false);
  $("ticker").classList.toggle("hidden", !on);
  $("ticker-track").innerHTML = TICKER_ITEMS.map((t) => `<span>${t}</span>`).join("");
  renderTickerToggle();
}
function renderTickerToggle() {
  $("ticker-toggle").textContent =
    store.get("ticker", false) ? "ticker: on — tap to hide" : "ticker: off — tap to show";
}
$("ticker-toggle").addEventListener("click", () => {
  store.set("ticker", !store.get("ticker", false));
  startTicker();
});

/* ── stage gestures (mobile first) ─────────────────── */

(function wireGestures() {
  const stage = $("stage");
  let t0 = null;

  stage.addEventListener("touchstart", (e) => {
    if (e.target.closest(".overlay, .osd, .widget, button, input, #interstitial, #splash")) { t0 = null; return; }
    const t = e.changedTouches[0];
    t0 = { x: t.clientX, y: t.clientY, ms: Date.now(), edgeL: t.clientX < 24, edgeR: t.clientX > innerWidth - 24 };
  }, { passive: true });

  stage.addEventListener("touchend", (e) => {
    if (!t0 || !state.on) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - t0.x, dy = t.clientY - t0.y, dt = Date.now() - t0.ms;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (dt < 700 && absX > 60 && absX > absY * 1.5) {
      if (t0.edgeL && dx > 0) return openPanel("guide");      // swipe in from left
      if (t0.edgeR && dx < 0) return openPanel("dock");       // swipe in from right
    }
    if (dt < 700 && absY > 70 && absY > absX * 1.5) {
      return zap(dy < 0 ? +1 : -1);                           // swipe up/down = zap
    }
    if (absX < 12 && absY < 12) toggleOverlays();             // tap
    t0 = null;
  }, { passive: true });

  stage.addEventListener("click", (e) => {
    if (!state.on) return;
    if (e.target.closest(".overlay, .osd, .widget, button, input, #interstitial, #splash")) return;
    if (matchMedia("(hover:hover)").matches || e.pointerType === "mouse") toggleOverlays();
  });
  stage.addEventListener("mousemove", () => {
    if (state.on && matchMedia("(hover:hover)").matches && !overlaysVisible()) showOverlays();
  });
})();

/* ── keyboard (the desktop remote) ─────────────────── */

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input")) {
    if (e.key === "Escape") { e.target.blur(); closePanels(); }
    return;
  }
  if (!state.on) {
    if (e.key === "Enter" || e.key === " ") powerOn();
    return;
  }
  switch (e.key) {
    case " ": e.preventDefault(); $("btn-play").click(); break;
    case "ArrowUp": zap(+1); break;
    case "ArrowDown": zap(-1); break;
    case "ArrowRight": video.currentTime += 10; showOverlays(); break;
    case "ArrowLeft": video.currentTime -= 10; showOverlays(); break;
    case "m": $("btn-mute").click(); break;
    case "f": $("btn-fs").click(); break;
    case "w": openPanel("dock"); break;
    case "g": case "e": openPanel("guide"); break;
    case "i": showOverlays(); $("infobar").classList.add("expanded"); updateInfo(); break;
    case "/": e.preventDefault(); openPanel("search"); break;
    case "p": powerOff(); break;
    case "Escape": closePanels(); break;
    case "+": case "=": userVolume = Math.min(1, userVolume + .1); applySound(video); showOSDVolume(); break;
    case "-": userVolume = Math.max(0, userVolume - .1); applySound(video); showOSDVolume(); break;
    default:
      if (/^[0-9]$/.test(e.key)) {
        if (state.digitBuffer.length >= 2) state.digitBuffer = "";
        state.digitBuffer += e.key;
        $("osd-digits").textContent = state.digitBuffer;
        $("osd-digits").classList.remove("hidden");
        clearTimeout(state.digitTimer);
        state.digitTimer = setTimeout(() => {
          const n = parseInt(state.digitBuffer, 10);
          state.digitBuffer = "";
          $("osd-digits").classList.add("hidden");
          const ch = CHANNELS.findIndex((c) => c.num === n);
          if (ch >= 0) { state.zapQuiet = !overlaysVisible(); crtBlink(); tune(ch); }
        }, 900);
      }
  }
});

/* ── art fallback: our own test card when archive art is unreachable ── */

const ART_FALLBACK = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
     <rect width="64" height="64" fill="#111"/>
     <rect x="4" y="4" width="56" height="56" rx="10" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2"/>
     <text x="32" y="41" font-family="Trebuchet MS,sans-serif" font-size="22" font-weight="bold"
           fill="rgb(198,96,12)" text-anchor="middle">tv</text>
   </svg>`);

document.addEventListener("error", (e) => {
  const t = e.target;
  if (t.tagName === "IMG" && t.src !== ART_FALLBACK) t.src = ART_FALLBACK;
}, true);

/* ── boot ──────────────────────────────────────────── */

applySound(video);
renderQuality();
renderTickerToggle();

/* While the splash breathes, quietly buffer what's on the saved channel
 * right now — power-on then swaps to an already-warm stream. */
(function warmTheValves() {
  try {
    const s = scheduleFor(CHANNELS[state.chIndex]);
    preloadBackstage(fastSrc(s.program), s.offset);
  } catch {}
})();
