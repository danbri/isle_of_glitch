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

/* archive imagery via /cors/ (CORS headers) so the service worker can
   cache icons/frames as real, unpadded responses */
const artUrl = (u) => u ? u.replace("https://archive.org/download/", "https://archive.org/cors/") : u;

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
  preload: store.get("preload", "eco"),   // eco: only the chosen channel; turbo: speculative warmth
  cc: store.get("cc", false),
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
  if (state.hotTune) return;               // backstage is busy tuning
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
    if (s.remaining < 20) {
      // the current show is in its final seconds — joining means a deep
      // seek into a big file for almost nothing; start the next show a
      // few seconds early instead
      progIndex = (s.index + 1) % ch.programs.length;
      offset = 0;
    } else {
      progIndex = s.index;
      offset = s.offset;
    }
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
    state.errStreak = 0;               // we made it on air: recovery resets
    state.coldStarted = null;          // cancels any pending zap-card show
    clearTimeout(state.slowJoinTimer);
    $("interstitial").classList.add("hidden");
    updateInfo();
    if (state.zapQuiet) { state.zapQuiet = false; showOSDChannel(); }
    else showOverlays();
  };

  /* quick-start fallback: joining a broadcast mid-film means a deep range
     request into a big file, which archive.org sometimes serves very
     slowly. If the live join hasn't produced a picture in 10s, play the
     program from the start instead — byte zero is the fastest part of
     the file (and often already in the first-seconds stash). */
  const armSlowJoin = () => {
    if (offset < 30) return;                  // near-start joins are already cheap
    clearTimeout(state.slowJoinTimer);
    state.slowJoinTimer = setTimeout(() => {
      if (token !== state.tuneToken || !state.on) return;
      const arrived = !state.hotTune && video.readyState >= 3 && !video.paused;
      if (arrived) return;
      state.zapQuiet = true;
      chatPush(null, "live join was slow — starting this show from the top", "sys");
      tune(state.chIndex, { fromStartProg: progIndex });
    }, 10000);
  };

  /* warm path: the backstage element already buffered this stream */
  if (backstageReadyFor(src) && opts.fromStartProg === undefined) {
    state.hotTune = null;
    $("tunebar").classList.add("hidden");
    swapStage();
    const drift = Math.abs((video.currentTime || 0) - offset);
    if (drift > 4 && offset < prog.dur - 2) { try { video.currentTime = offset; } catch {} }
    const p = video.play();
    if (p) p.catch(() => {});
    arrive();
    updateAncillary(ch, prog);
    return;
  }

  /* hot path: something is already playing — keep it on the air (picture
     and sound) and load the new channel backstage; swap when it's ready.
     Nothing locks; only a small progress pill reports the tuning. */
  if (state.on && video.readyState >= 2 && !video.paused && !video.ended) {
    state.hotTune = { token, src, offset, prog, started: Date.now() };
    $("tunebar-text").innerHTML = `tuning · <b>${ch.num}</b> ${esc(ch.name)} — ${esc(prog.title)}`;
    $("tunebar-fill").style.transform = "scaleX(0.04)";
    $("tunebar").classList.remove("hidden");
    backstage.dataset.src = src;
    backstage.muted = true;
    backstage.src = src;
    if (offset > 1 && offset < prog.dur - 2) {
      backstage.addEventListener("loadedmetadata", function seekOnce() {
        if (state.hotTune?.token === token) { try { backstage.currentTime = offset; } catch {} }
      }, { once: true });
    }
    backstage.addEventListener("canplay", function hotArrive() {
      if (state.hotTune?.token !== token || token !== state.tuneToken) return;
      state.hotTune = null;
      $("tunebar-fill").style.transform = "scaleX(1)";
      setTimeout(() => $("tunebar").classList.add("hidden"), 350);
      swapStage();
      // correct live drift accumulated while tuning
      if (opts.fromStartProg === undefined) {
        const fresh = scheduleFor(ch);
        if (fresh.index === progIndex && Math.abs((video.currentTime || 0) - fresh.offset) > 4) {
          try { video.currentTime = fresh.offset; } catch {}
        }
      }
      const p = video.play();
      if (p) p.catch(() => {});
      arrive();
    }, { once: true });
    backstage.load();
    armSlowJoin();
    updateInfo();
    updateAncillary(ch, prog);
    return;
  }

  state.hotTune = null;
  $("tunebar").classList.add("hidden");

  /* cold-adopt: the splash (or an earlier warm-up) already started loading
     exactly this stream backstage — put that element on the air and let it
     finish there, rather than restarting the download from scratch */
  if (backstage.dataset.src === src && !backstage.error && opts.fromStartProg === undefined) {
    swapStage();
    video.addEventListener("playing", () => {
      if (token !== state.tuneToken) return;
      const fresh = scheduleFor(ch);
      if (!state.onDemand && fresh.index === progIndex &&
          Math.abs((video.currentTime || 0) - fresh.offset) > 4) {
        try { video.currentTime = fresh.offset; } catch {}   // drift while splash sat
      }
      arrive();
    }, { once: true });
    const p = video.play();
    if (p) p.catch(() => {});
    showZapCard(ch, prog, token);
    armSlowJoin();
    updateInfo();
    updateAncillary(ch, prog);
    return;
  }

  /* cold path (nothing on the air): full zap card — an indicative frame,
     a progress bar, and no input lock at all */
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

  showZapCard(ch, prog, token);
  armSlowJoin();
  updateInfo();
  updateAncillary(ch, prog);
}

/* the zap card appears only if arrival takes noticeable time — fast starts
   never flash it */
function showZapCard(ch, prog, token) {
  state.coldStarted = Date.now();
  setTimeout(() => {
    if (token !== state.tuneToken || !state.on) return;
    if (state.coldStarted === null) return;                 // arrive() beat us to it
    if (video.readyState >= 3 && !video.paused) return;    // already on the air
    $("interstitial-text").textContent = "Fetching your channel…";
    $("interstitial-channel").textContent = ch.num + " · " + ch.name;
    const frame = artUrl(prog.frame || prog.art || ch.art);
    $("interstitial").style.backgroundImage = frame
      ? `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.75)), url("${frame}")` : "";
    $("interstitial-progress").firstElementChild.style.transform = "scaleX(0.03)";
    $("interstitial").classList.remove("hidden");
  }, 250);
}

/* the tuning progress bars: real readiness milestones blended with a
   gently fictionalized time easing, so the bar always moves */
function tuneProgress(el, startedMs, readyState) {
  const t = (Date.now() - startedMs) / 1000;
  const eased = 0.9 * (1 - Math.exp(-t / 5));          // →90% over ~15s
  const mile = [0.06, 0.35, 0.6, 0.8, 0.92][Math.min(readyState, 4)];
  el.style.transform = `scaleX(${(Math.max(eased, mile) * 0.95).toFixed(3)})`;
}
setInterval(() => {
  if (state.hotTune) tuneProgress($("tunebar-fill"), state.hotTune.started, backstage.readyState);
  else if (!$("interstitial").classList.contains("hidden") && state.coldStarted) {
    tuneProgress($("interstitial-progress").firstElementChild, state.coldStarted, video.readyState);
  }
}, 400);

function updateAncillary(ch, prog) {
  renderGuideList();
  renderJewels();
  chatOnZap(ch, prog);
  loadSubtitles(prog);
  warmZapFrames();
  renderBuddy();
  reflectHash();
}

/* pre-warm the neighbours' zap-card frames — a few KB each, so this is
   cheap enough to do even in eco mode; makes skim-flipping feel solid */
function warmZapFrames() {
  [-1, 1].forEach((d) => {
    const ch = CHANNELS[((state.chIndex + d) % CHANNELS.length + CHANNELS.length) % CHANNELS.length];
    const s = scheduleFor(ch);
    const f = artUrl(s.program.frame || s.program.art || ch.art);
    if (f) { const img = new Image(); img.src = f; }
  });
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
  // they watched one to the end — in turbo, bank the first seconds of
  // likely next destinations for instant flips later
  prefetchFirstSeconds();
  const s = scheduleFor(currentChannel());
  if (backstageReadyFor(fastSrc(s.program))) {
    state.zapQuiet = true;          // no interstitial, just roll on
  }
  tune(state.chIndex);
}

function onVideoError(e) {
  if (!state.on) return;
  const bad = e.target?.dataset?.src;   // capture before releasing claims
  if (e.target !== video) {
    if (e.target !== backstage) return;
    const wasHotTune = !!state.hotTune;
    delete backstage.dataset.src;     // never adopt a corpse
    if (!wasHotTune) return;          // a speculative preload died: shrug
    // a hot tune died backstage: stop the spinner and enter the ladder
    state.hotTune = null;
    $("tunebar").classList.add("hidden");
  }
  // a stream that errored may have a poisoned cached prefix — drop it
  if (bad && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "evict", key: bad });
  }

  /* escalating recovery, never a tight loop:
     1st failure  → retry the same tune after 4s
     2nd failure  → skip to the channel's next program from the start
     3rd failure  → declare the channel off-air and hop to the next one */
  state.errStreak = (state.errStreak || 0) + 1;
  const streak = state.errStreak;
  const tk = state.tuneToken;
  let msg, delay = Math.min(4000 * streak, 12000), action;
  if (streak <= 1) {
    msg = "Channel hiccup — re-tuning…";
    action = () => tune(state.chIndex);
  } else if (streak === 2) {
    msg = "Stream trouble — skipping to the next program…";
    action = () => {
      const s = scheduleFor(currentChannel());
      tune(state.chIndex, { fromStartProg: (s.index + 1) % currentChannel().programs.length });
    };
  } else {
    msg = "This channel seems to be off the air — trying the next one…";
    action = () => { state.errStreak = 0; state.zapQuiet = false; tune(state.chIndex + 1); };
  }
  $("interstitial-text").textContent = msg;
  $("interstitial").classList.remove("hidden");
  setTimeout(() => { if (state.on && tk === state.tuneToken) action(); }, delay);
}

[$("tv-a"), $("tv-b")].forEach((el) => {
  el.addEventListener("ended", onProgramEnded);
  el.addEventListener("error", onVideoError);
  el.addEventListener("playing", (e) => {
    if (e.target === video) state.errStreak = 0;   // on air = recovered
  });
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
  $("info-art").src = artUrl(p.frame || p.art || ch.art);
  $("time-total").textContent = fmt(p.dur);

  // expanded panel
  $("info-desc").textContent = p.desc || ch.tagline || "";

  // Wikipedia lead extract (CC BY-SA — shown with attribution + link)
  if (p.wpx && p.wp) {
    $("info-wiki-text").textContent = p.wpx;
    $("info-wiki-link").href = p.wp;
    $("info-wiki").classList.remove("hidden");
  } else {
    $("info-wiki").classList.add("hidden");
  }

  // quiet sideways paths from this program
  const sched2 = $("info-sched");
  const info2 = currentProgramInfo();
  const threads = threadsFor(state.chIndex, info2.index, 2);
  threads.forEach((t) => {
    const row = document.createElement("div");
    row.className = "sched-row im-threadrow";
    row.innerHTML = `<span class="t">⤳</span><span class="n">${esc(t.label)}</span>`;
    row.style.cursor = "pointer";
    row.addEventListener("click", () => { crtBlink(); tune(t.ci, { fromStartProg: t.pi }); });
    sched2.appendChild(row);
  });

  // Watch Buddy notes, right in the full metadata view
  const chips = buddyChips(p);
  if (chips.length && store.get("buddy", true)) {
    $("info-buddy-chips").innerHTML =
      `<span class="ibc-label">👀 watch buddy:</span> ${chips.map((c) => `<span>${c}</span>`).join(" ")} <u>view notes</u>`;
    $("info-buddy-chips").classList.remove("hidden");
    $("info-buddy-chips").onclick = openBuddy;
  } else {
    $("info-buddy-chips").classList.add("hidden");
  }
  $("info-facts").textContent = [
    (p.year ? "first shown " + p.year : null),
    fmt(p.dur),
    (p.dir?.length ? "dir. " + p.dir.join(", ") : null),
    (p.cast?.length ? "with " + p.cast.join(", ") : null),
    (p.co?.length ? p.co.join(", ") : null),
    p.license
  ].filter(Boolean).join(" · ");
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

  // provenance you can check: Wikipedia article + Wikidata identity
  if (p.wp) { $("info-wp").href = p.wp; $("info-wp").classList.remove("hidden"); }
  else $("info-wp").classList.add("hidden");
  if (p.wd) { $("info-wd").href = "https://www.wikidata.org/wiki/" + p.wd; $("info-wd").classList.remove("hidden"); }
  else $("info-wd").classList.add("hidden");
}

function overlaysVisible() { return !$("controller").classList.contains("hidden"); }

function showOverlays() {
  $("osd-channel").classList.add("hidden");
  $("controller").classList.remove("hidden");
  $("infobar").classList.remove("hidden");
  if (matchMedia("(hover:hover)").matches) $("volume").classList.remove("hidden");
  document.body.classList.add("overlays-on");   // lifts the buddy strip clear of the controller
  armOverlayTimer();
}
function hideOverlays() {
  $("controller").classList.add("hidden");
  $("infobar").classList.add("hidden");
  $("infobar").classList.remove("expanded");
  $("volume").classList.add("hidden");
  document.body.classList.remove("overlays-on");
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
  $("progress-fill").style.transform = `scaleX(${pct / 100})`;
  $("progress-handle").style.left = pct + "%";

  const remaining = dur - t;

  // a wait card must never sit over healthy playback
  if (!$("interstitial").classList.contains("hidden") &&
      !video.paused && video.readyState >= 3 && !state.hotTune) {
    $("interstitial").classList.add("hidden");
  }

  // a settled pause earns an intermission
  if (video.paused && state.pausedSince && Date.now() - state.pausedSince > 6000 &&
      $("intermission").classList.contains("hidden")) {
    tryShowIntermission();
  }

  /* backstage priorities, most urgent first:
     1. the junction — stage the next program ~45s out
     2. the quality upgrade — swap fast → best a few seconds in
     3. idle warmth — buffer the next channel up the dial for instant zaps */
  if (state.hotTune) {
    // tuning in progress — leave the backstage element alone
  } else if (remaining < 45 && remaining > 2 && !video.paused) {
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
  } else if (state.preload === "turbo" && !state.upgrade &&
             t > 15 && remaining > 60 && !video.paused && CHANNELS.length > 1) {
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
  bar.style.transform = `scaleX(${userMuted ? 0 : userVolume})`;
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
  if (pendingDeepLink?.kind === "ia") {
    tune(pendingDeepLink.ci, { fromStartProg: pendingDeepLink.pi });
    pendingDeepLink = null;
  } else {
    pendingDeepLink = null;
    tune(state.chIndex);
  }
  startClock();
  startTicker();
  restorePins();
  requestDurableStorage();   // user gesture: best moment to ask
}

/* ask the browser to mark this origin's storage (the first-seconds
   stash, settings, everything) as persistent, so it survives reboots
   and storage pressure instead of being best-effort evictable */
async function requestDurableStorage() {
  const el = $("storage-status");
  try {
    const persisted = navigator.storage?.persist
      ? await navigator.storage.persist() : false;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const mb = est ? Math.round((est.usage || 0) / 1048576) : null;
    el.textContent = "storage: " +
      (persisted ? "persistent ✓ (survives reboots)" : "best-effort (browser may reclaim)") +
      (mb !== null ? ` · ${mb} MB stashed` : "");
  } catch {
    el.textContent = "";
  }
}

function powerOff() {
  state.on = false;
  state.hotTune = null;
  clearTimeout(state.slowJoinTimer);
  state.errStreak = 0;
  $("tunebar").classList.add("hidden");
  $("buddy-overlay").classList.add("hidden");
  $("comingup").classList.add("hidden");
  $("osd-channel").classList.add("hidden");
  $("osd-digits").classList.add("hidden");
  history.replaceState(null, "", location.pathname);   // clean URL at the front door
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
    renderGuideView();
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
document.querySelectorAll(".drawer-close[data-close]").forEach((b) =>
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
      renderGuideView();
    });
    nav.appendChild(b);
  });
}

/* two ways to browse: the swoosh carousel, or the everything-grid */
function renderGuideView() {
  const grid = store.get("guideView", "swoosh") === "grid";
  $("gv-grid").classList.toggle("hidden", grid);       // button shows the *other* mode
  $("gv-swoosh").classList.toggle("hidden", !grid);
  $("guide-rail").classList.toggle("hidden", grid);
  $("guide-list").classList.toggle("hidden", grid);
  $("guide-grid").classList.toggle("hidden", !grid);
  if (grid) {
    renderGuideGrid();
  } else {
    renderGuideRail();
    renderGuideList();
    requestAnimationFrame(() => centerGuideTile(state.chIndex, "instant"));
  }
}
$("guide-view").addEventListener("click", () => {
  store.set("guideView", store.get("guideView", "swoosh") === "grid" ? "swoosh" : "grid");
  renderGuideView();
});

/* every program of every channel in the category, with its next air time */
/* tonight's thread: one small daily trail through the dial, the same
   for everyone all day (seeded by the date) — programming, not a feed */
function tonightsThread() {
  const all = [];
  CHANNELS.forEach((ch, ci) => ch.programs.forEach((p, pi) => all.push({ ci, pi })));
  if (!all.length) return null;
  const d = new Date();
  let seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const start = all[Math.floor(rnd() * all.length)];
  const trail = [start];
  const used = new Set([start.ci + ":" + start.pi]);
  let cur = start;
  for (let hop = 0; hop < 3; hop++) {
    const next = threadsFor(cur.ci, cur.pi, 6).find((t) => !used.has(t.ci + ":" + t.pi));
    if (!next) break;
    used.add(next.ci + ":" + next.pi);
    trail.push(next);
    cur = next;
  }
  return trail.length >= 3 ? trail : null;
}

function renderTonightsThread(box) {
  const trail = tonightsThread();
  if (!trail) return;
  const sec = document.createElement("div");
  sec.className = "tonight";
  sec.innerHTML = '<div class="tonight-label">tonight\u2019s thread</div>';
  trail.forEach((t, i) => {
    const p = CHANNELS[t.ci].programs[t.pi];
    const row = document.createElement("button");
    row.className = "im-thread";
    row.textContent = (i ? "⤳ " : "▷ ") +
      (t.label || `${p.title}${p.year ? " (" + p.year + ")" : ""} · ch ${CHANNELS[t.ci].num}`);
    row.addEventListener("click", () => { closePanels(); crtBlink(); tune(t.ci, { fromStartProg: t.pi }); });
    sec.appendChild(row);
  });
  box.appendChild(sec);
}

function renderGuideGrid() {
  const box = $("guide-grid");
  box.innerHTML = "";
  renderTonightsThread(box);
  const chans = channelsInCategory();
  if (!chans.length) {
    box.innerHTML = '<div class="search-empty">No channels here yet — tap ★ on a channel to add it to My Channels.</div>';
    return;
  }
  chans.forEach((ch) => {
    const sched = scheduleFor(ch);
    const sec = document.createElement("div");
    sec.className = "g-section";

    const head = document.createElement("div");
    head.className = "g-head";
    head.innerHTML = `
      <img src="${ch.art}" alt="" loading="lazy">
      <div class="g-head-text">
        <div class="g-head-name"><span class="chnum">${ch.num}</span>${ch.name}</div>
        <div class="g-head-tag">${ch.tagline || ch.category} · ${ch.programs.length} programs</div>
      </div>`;
    const fav = document.createElement("button");
    fav.className = "fav-btn" + (state.favs.has(ch.id) ? " on" : "");
    fav.textContent = "★";
    fav.addEventListener("click", (e) => {
      e.stopPropagation();
      state.favs.has(ch.id) ? state.favs.delete(ch.id) : state.favs.add(ch.id);
      store.set("favs", [...state.favs]);
      fav.classList.toggle("on");
      if (state.category === "my") renderGuideGrid();
    });
    head.appendChild(fav);
    head.addEventListener("click", () => { closePanels(); crtBlink(); tune(CHANNELS.indexOf(ch)); });
    sec.appendChild(head);

    // next air time for every program: walk one broadcast cycle from now
    const starts = new Array(ch.programs.length);
    let t = Date.now() - sched.offset * 1000;
    for (let k = 0; k < ch.programs.length; k++) {
      const idx = (sched.index + k) % ch.programs.length;
      starts[idx] = t;
      t += ch.programs[idx].dur * 1000;
    }

    const grid = document.createElement("div");
    grid.className = "g-grid";
    ch.programs.forEach((p, pi) => {
      const live = pi === sched.index;
      const card = document.createElement("div");
      card.className = "g-card" + (live ? " now" : "");
      card.innerHTML = `
        <img src="${artUrl(p.frame || p.art || ch.art)}" alt="" loading="lazy">
        <div class="g-card-label">
          <div class="g-card-title">${p.title}</div>
          <div class="g-card-sub">${live ? '<span class="live-tag">LIVE</span>' : clock12(new Date(starts[pi]))}
            ${p.year ? "<span>· " + p.year + "</span>" : ""}${buddyBadge(p)}</div>
        </div>`;
      card.addEventListener("click", () => {
        closePanels(); crtBlink();
        const chIdx = CHANNELS.indexOf(ch);
        live ? tune(chIdx) : tune(chIdx, { fromStartProg: pi });
      });
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    box.appendChild(sec);
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
      <img src="${artUrl(s.program.frame || s.program.art || ch.art)}" alt="" loading="lazy">
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
        if (state.preload === "turbo" && state.guideIndex === idx && idx !== state.chIndex) {
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
      <span class="n">${slot.program.title}${slot.program.year ? " <small>(" + slot.program.year + ")</small>" : ""}${buddyBadge(slot.program)}</span>
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
    box.innerHTML = '<div class="search-empty">Try “bunny”, “zombie”, a year (“1951”), a decade (“1920s”), or a label (“😨”)…</div>';
    return;
  }
  let hits = 0;
  const yearQ = /^(18|19|20)\d\d$/.test(q) ? parseInt(q, 10) : null;
  const decadeQ = /^(18|19|20)\d0s$/.test(q) ? parseInt(q, 10) : null;
  const emojiQ = /\p{Extended_Pictographic}/u.test(q) ? q.trim() : null;
  CHANNELS.forEach((ch) => {
    ch.programs.forEach((p, pi) => {
      if (hits >= 40) return;
      let match;
      if (yearQ) match = p.year === yearQ;
      else if (decadeQ) match = p.year && Math.floor(p.year / 10) * 10 === decadeQ;
      else if (emojiQ) match = buddyChips(p).includes(emojiQ);
      else {
        const hay = (ch.name + " " + p.title + " " + (p.desc || "") + " " + ch.category + " " +
          (p.dir || []).join(" ") + " " + (p.cast || []).join(" ") + " " + (p.kw || []).join(" ")).toLowerCase();
        match = hay.includes(q);
      }
      if (!match) return;
      hits++;
      const live = scheduleFor(ch).index === pi;
      const el = document.createElement("div");
      el.className = "sr";
      el.innerHTML = `<img src="${artUrl(p.frame || p.art || ch.art)}" alt="" loading="lazy">
        <div><div class="sr-title">${p.title}${p.year ? " (" + p.year + ")" : ""}${buddyBadge(p)}</div>
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

/* ── first-seconds cache (service worker) ──────────── */

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* After a full watch, bank the opening ~1.5MB of likely destinations
   (turbo only): the chosen channel's next program, the neighbours'
   live streams, and My Channels. One small ranged GET each, via the SW. */
/* archive.org media nodes lack CORS headers; /cors/ has them — the SW
   fetches via /cors/ but caches under the /download/ URL videos request */
function corsVia(url) {
  return MIRROR ? url : url.replace("https://archive.org/download/", "https://archive.org/cors/");
}

function prefetchFirstSeconds() {
  if (state.preload !== "turbo" || !navigator.serviceWorker?.controller) return;
  const keys = new Set();
  const next = listingFor(currentChannel(), 2)[1];
  if (next) keys.add(fastSrc(next.program));
  [-1, 1].forEach((d) => {
    const ch = CHANNELS[((state.chIndex + d) % CHANNELS.length + CHANNELS.length) % CHANNELS.length];
    keys.add(fastSrc(scheduleFor(ch).program));
  });
  CHANNELS.filter((ch) => state.favs.has(ch.id)).slice(0, 3)
    .forEach((ch) => keys.add(fastSrc(scheduleFor(ch).program)));
  navigator.serviceWorker.controller.postMessage({
    type: "prefetch",
    urls: [...keys].slice(0, 6).map((key) => ({ key, via: corsVia(key) }))
  });
}

/* ── trickle prefetch: fill the first-seconds cache in the background,
      but only when device conditions permit (turbo mode only) ── */

/* stash 5s of each likely next pick on phones, 10s on desktops */
const PREFETCH_SECONDS = matchMedia("(pointer: coarse)").matches ? 5 : 10;
const trickled = new Set();

function prefixCap(p) {
  // right-size each prefix from the stream's real bitrate when known
  if (p.bytes && p.dur) {
    return Math.min(2 * 1024 * 1024, Math.ceil((p.bytes / p.dur) * PREFETCH_SECONDS) + 128 * 1024);
  }
  return 1.5 * 1024 * 1024;
}

function trickleTargets() {
  const out = [];
  const push = (prog) => {
    const key = fastSrc(prog);
    if (!trickled.has(key)) out.push({ key, via: corsVia(key), cap: prefixCap(prog) });
  };
  CHANNELS.filter((ch) => state.favs.has(ch.id)).forEach((ch) => push(scheduleFor(ch).program));
  listingFor(currentChannel(), 3).slice(1).forEach((slot) => push(slot.program));
  [-1, 1].forEach((d) => {
    const ch = CHANNELS[((state.chIndex + d) % CHANNELS.length + CHANNELS.length) % CHANNELS.length];
    push(scheduleFor(ch).program);
  });
  channelsInCategory().forEach((ch) => push(scheduleFor(ch).program));
  return out;
}

async function conditionsPermit() {
  const c = navigator.connection;
  if (c && (c.saveData || /(^|\b)(slow-)?2g\b/.test(c.effectiveType || ""))) return false;
  if (navigator.getBattery) {
    try {
      const b = await navigator.getBattery();
      if (!b.charging && b.level < 0.35) return false;
    } catch {}
  }
  return true;
}

async function trickleTick() {
  if (!state.on || state.preload !== "turbo" || document.hidden) return;
  if (!navigator.serviceWorker?.controller) return;
  if (state.hotTune || video.readyState < 3) return;   // never compete with playback
  if (!(await conditionsPermit())) return;
  const next = trickleTargets()[0];
  if (!next) return;
  trickled.add(next.key);
  navigator.serviceWorker.controller.postMessage({ type: "prefetch", urls: [next] });
}

/* one small fetch at a time, on idle, well spaced out */
setInterval(() => {
  if ("requestIdleCallback" in window) requestIdleCallback(() => trickleTick(), { timeout: 8000 });
  else trickleTick();
}, 40000);

/* ── subtitles (archive.org .srt/.vtt, incl. auto-generated ASR) ── */

let subsToken = 0;

function srtToVtt(text) {
  return "WEBVTT\n\n" + text.replace(/\r/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{1,3})/g,
      (_, hms, ms) => `${hms}.${ms.padEnd(3, "0")}`);
}

function clearSubtitles() {
  [video, backstage].forEach((el) => el.querySelectorAll("track").forEach((t) => t.remove()));
  $("info-cc").classList.add("hidden");
}

async function loadSubtitles(prog) {
  const token = ++subsToken;
  clearSubtitles();
  const item = (prog.src || "").match(/archive\.org\/download\/([^/]+)\//);
  if (!item || !prog.subs) return;
  try {
    const url = `https://archive.org/cors/${item[1]}/${prog.subs.split("/").map(encodeURIComponent).join("/")}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok || token !== subsToken) return;
    let text = await r.text();
    if (token !== subsToken) return;
    if (!/^WEBVTT/.test(text)) text = srtToVtt(text);
    const blob = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
    const track = document.createElement("track");
    track.kind = "captions";
    track.label = /\.asr\./i.test(prog.subs) ? "Auto captions" : "Captions";
    track.src = blob;
    track.default = false;
    video.appendChild(track);
    track.track.mode = state.cc ? "showing" : "hidden";
    $("info-cc").classList.remove("hidden");
    $("info-cc").classList.toggle("lit", state.cc);
  } catch {}
}

$("info-cc").addEventListener("click", () => {
  state.cc = !state.cc;
  store.set("cc", state.cc);
  const t = video.querySelector("track");
  if (t) t.track.mode = state.cc ? "showing" : "hidden";
  $("info-cc").classList.toggle("lit", state.cc);
});

/* ── 👀 Watch Buddy ────────────────────────────────── */

const DATED_TEXT = "This material expresses or represents perspectives that " +
  "some viewers might consider outdated, disrespectful, misleading or just " +
  "plain bad. Watch carefully, or choose something easier.";

/* index the annotation graph by archive.org details URI */
const BUDDY_BY_ID = {};
(typeof WATCH_BUDDY_GRAPH !== "undefined" ? WATCH_BUDDY_GRAPH : []).forEach((node) => {
  if (node["@id"]) BUDDY_BY_ID[node["@id"]] = node;
});

function buddyFor(prog) {
  const m = (prog.src || "").match(/archive\.org\/download\/([^/]+)\//);
  if (!m) return null;
  const node = BUDDY_BY_ID["https://archive.org/details/" + m[1]];
  if (!node) return null;
  const facts = node.factCheck
    ? (Array.isArray(node.factCheck) ? node.factCheck : [node.factCheck]) : [];
  const has = node.contentWarning || node.datedPerspectives || facts.length;
  return has ? {
    warning: node.contentWarning || null,
    dated: !!node.datedPerspectives,
    datedNote: node.datedNote || null,
    facts,
    wiki: node.sameAs || null
  } : null;
}

/* the chips for a program's notes — used on the strip, in the info panel,
   on explore cards, in listings and search results */
function buddyChips(prog) {
  const b = buddyFor(prog);
  if (!b) return [];
  const chips = [];
  if (b.warning) chips.push(b.warning.warningEmoji || "😳");
  if (b.dated) chips.push("⏳");
  if (b.facts.length) chips.push("📚");
  return chips;
}
const buddyBadge = (prog) => {
  const c = buddyChips(prog);
  return c.length ? `<span class="buddy-mini" title="Watch Buddy notes">${c.join("")}</span>` : "";
};

let buddyWasPlaying = false;

function renderBuddy() {
  const enabled = store.get("buddy", true);
  const info = currentProgramInfo();
  const chips = enabled ? buddyChips(info.program) : [];
  const strip = $("buddy-strip");
  if (!chips.length || !state.on) { strip.classList.add("hidden"); }
  else {
    strip.innerHTML = chips.map((c) => `<span>${c}</span>`).join("");
    strip.classList.remove("hidden");
  }
  $("buddy-now").textContent = chips.length
    ? "notes available for what's on now — tap the chips on screen"
    : "no notes for what's on right now";
}

function openBuddy() {
  const info = currentProgramInfo();
  const b = buddyFor(info.program);
  if (!b) return;
  buddyWasPlaying = !video.paused;
  video.pause();
  $("buddy-program").textContent =
    info.program.title + (info.program.year ? " (" + info.program.year + ")" : "");
  const box = $("buddy-sections");
  box.innerHTML = "";
  const sec = (emoji, label, html) => {
    const el = document.createElement("div");
    el.className = "buddy-sec";
    el.innerHTML = `<div class="b-emoji">${emoji}</div>
      <div class="b-text"><div class="b-label">${label}</div>${html}</div>`;
    box.appendChild(el);
  };
  if (b.warning) {
    sec(b.warning.warningEmoji || "😳", "heads up", esc(b.warning.text));
  }
  if (b.dated) {
    sec("⏳", "of its time", esc(DATED_TEXT) +
      (b.datedNote ? `<p class="b-more">${esc(b.datedNote)}</p>` : ""));
  }
  if (b.facts.length) {
    sec("📚", "fact checkable", b.facts.map((f) =>
      `<div class="buddy-claim">
         ${f.claimReviewed ? `<div class="c-claim">${esc(f.claimReviewed)}</div>` : ""}
         <a href="${f.url}" target="_blank" rel="noopener">${esc(f.name || f.url)}</a>
       </div>`).join(""));
  }
  if (b.wiki) {
    sec("🌐", "background", `<a href="${b.wiki}" target="_blank" rel="noopener">${esc(decodeURIComponent(b.wiki.split("/wiki/").pop() || "Wikipedia").replace(/_/g, " "))} on Wikipedia</a>`);
  }
  $("buddy-overlay").classList.remove("hidden");
}

function closeBuddy() {
  $("buddy-overlay").classList.add("hidden");
  if (buddyWasPlaying) { const p = video.play(); if (p) p.catch(() => {}); }
  buddyWasPlaying = false;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

$("buddy-strip").addEventListener("click", openBuddy);
$("buddy-resume").addEventListener("click", closeBuddy);
$("buddy-overlay").addEventListener("click", (e) => { if (e.target === $("buddy-overlay")) closeBuddy(); });

function renderBuddyToggle() {
  $("buddy-toggle").textContent =
    store.get("buddy", true) ? "watch buddy: on — tap to hide" : "watch buddy: off — tap to show";
}
$("buddy-toggle").addEventListener("click", () => {
  store.set("buddy", !store.get("buddy", true));
  renderBuddyToggle();
  renderBuddy();
});

/* ⚙️ the explorer: an easter-egg index of the dial, navigated by the
   warning labels themselves — pick an emoji, see everything it marks */
function openBuddyExplorer() {
  buddyWasPlaying = false;                 // browsing, not warning-reading: keep playing
  $("buddy-program").textContent = "the label index";
  const box = $("buddy-sections");
  box.innerHTML = "";

  const byChip = new Map();                // emoji -> [{ch, pi, prog, note}]
  CHANNELS.forEach((ch) => ch.programs.forEach((prog, pi) => {
    const b = buddyFor(prog);
    if (!b) return;
    const add = (chip, note) => {
      if (!byChip.has(chip)) byChip.set(chip, []);
      byChip.get(chip).push({ ch, pi, prog, note });
    };
    if (b.warning) add(b.warning.warningEmoji || "😳", b.warning.text);
    if (b.dated) add("⏳", "of its time");
    if (b.facts.length) add("📚", b.facts[0].claimReviewed || "fact checkable");
  }));

  const cloud = document.createElement("div");
  cloud.id = "buddy-cloud";
  [...byChip.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([chip, list]) => {
    const btn = document.createElement("button");
    btn.className = "buddy-cloud-chip";
    btn.innerHTML = `${chip}<small>${list.length}</small>`;
    btn.addEventListener("click", () => {
      box.querySelectorAll(".buddy-chip-list").forEach((el) => el.remove());
      cloud.querySelectorAll(".buddy-cloud-chip").forEach((el) => el.classList.remove("lit"));
      btn.classList.add("lit");
      const wrap = document.createElement("div");
      wrap.className = "buddy-chip-list";
      list.forEach(({ ch, pi, prog, note }) => {
        const live = scheduleFor(ch).index === pi;
        const row = document.createElement("div");
        row.className = "buddy-x-row";
        row.innerHTML = `<span class="x-title">${esc(prog.title)}${prog.year ? " <small>(" + prog.year + ")</small>" : ""}</span>
          <span class="x-sub">${ch.num} · ${esc(ch.name)}${live ? ' · <b>ON AIR</b>' : ""}<br><i>${esc(note)}</i></span>`;
        row.addEventListener("click", () => {
          closeBuddy(); closePanels(); crtBlink();
          const chIdx = CHANNELS.indexOf(ch);
          live ? tune(chIdx) : tune(chIdx, { fromStartProg: pi });
        });
        wrap.appendChild(row);
      });
      box.appendChild(wrap);
    });
    cloud.appendChild(btn);
  });

  const sec = document.createElement("div");
  sec.className = "buddy-sec";
  sec.innerHTML = `<div class="b-emoji">🗺️</div>
    <div class="b-text"><div class="b-label">navigate by label</div>
    Tap an emoji to see everything on the dial it marks. Yes, this is a
    legitimate way to choose an evening's viewing.</div>`;
  box.appendChild(sec);
  box.appendChild(cloud);
  $("buddy-overlay").classList.remove("hidden");
}
$("buddy-config").addEventListener("click", openBuddyExplorer);

/* ── widgets: preloading policy ────────────────────── */

function renderPreload() {
  $("preload-toggle").textContent =
    state.preload === "turbo" ? "preloading: turbo — tap for eco" : "preloading: eco — tap for turbo";
}
$("preload-toggle").addEventListener("click", () => {
  state.preload = state.preload === "turbo" ? "eco" : "turbo";
  store.set("preload", state.preload);
  renderPreload();
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
    if (e.target.closest(".overlay, .osd, .widget, button, input, #interstitial, #splash, #buddy-strip, #buddy-overlay")) { t0 = null; return; }
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
    if (e.target.closest(".overlay, .osd, .widget, button, input, #interstitial, #splash, #buddy-strip, #buddy-overlay")) return;
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

/* ── threads: quiet sideways paths between programs ─
 * Connections computed from what the lineup actually knows — shared
 * directors and casts, shared dialogue keywords, the same year, the
 * same Watch Buddy label, the same decade. At most three, text-first,
 * never auto-playing anything. */

function threadsFor(ci, pi, max = 3) {
  const me = CHANNELS[ci].programs[pi];
  const out = [];
  const seen = new Set([ci + ":" + pi]);
  const add = (tci, tpi, label) => {
    const k = tci + ":" + tpi;
    if (seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push({ ci: tci, pi: tpi, label });
  };
  const each = (fn) => {
    for (let tci = 0; tci < CHANNELS.length && out.length < max; tci++) {
      const ps = CHANNELS[tci].programs;
      for (let tpi = 0; tpi < ps.length && out.length < max; tpi++) {
        if (tci === ci && tpi === pi) continue;
        fn(ps[tpi], tci, tpi);
      }
    }
  };
  const title = (p, tci) => `${p.title}${p.year ? " (" + p.year + ")" : ""} · ch ${CHANNELS[tci].num}`;

  if (me.dir?.length) each((p, tci, tpi) => {
    const d = me.dir.find((x) => p.dir?.includes(x));
    if (d) add(tci, tpi, `also directed by ${d}: ${title(p, tci)}`);
  });
  if (me.cast?.length && out.length < max) each((p, tci, tpi) => {
    const a = me.cast.find((x) => p.cast?.includes(x));
    if (a) add(tci, tpi, `also with ${a}: ${title(p, tci)}`);
  });
  if (me.kw?.length && out.length < max) each((p, tci, tpi) => {
    if (!p.kw) return;
    const common = me.kw.filter((w) => p.kw.includes(w));
    if (common.length >= 2) add(tci, tpi, `both keep saying “${common[0]}”: ${title(p, tci)}`);
  });
  if (me.year && out.length < max) each((p, tci, tpi) => {
    if (p.year === me.year && tci !== ci) add(tci, tpi, `also from ${me.year}: ${title(p, tci)}`);
  });
  const myChips = buddyChips(me);
  if (myChips.length && out.length < max) each((p, tci, tpi) => {
    const c = myChips.find((x) => buddyChips(p).includes(x));
    if (c) add(tci, tpi, `also marked ${c}: ${title(p, tci)}`);
  });
  if (me.year && out.length < max) each((p, tci, tpi) => {
    if (p.year && tci !== ci && Math.floor(p.year / 10) === Math.floor(me.year / 10)) {
      add(tci, tpi, `elsewhere in the ${Math.floor(me.year / 10) * 10}s: ${title(p, tci)}`);
    }
  });
  return out;
}

/* ── intermission: the considered pause screen ──────
 * Only after you have genuinely settled into a pause (6s), never over
 * other UI. Context first, then at most three threads. Nothing counts
 * down, nothing auto-plays. */

function tryShowIntermission() {
    if (!state.on || !video.paused || state.hotTune) return;
    if (!$("interstitial").classList.contains("hidden")) return;
    if ($("guide").classList.contains("open") || $("dock").classList.contains("open")) return;
    if (!$("buddy-overlay").classList.contains("hidden")) return;
    const info = currentProgramInfo();
    const p = info.program;
    const ch = currentChannel();
    $("im-title").textContent = p.title + (p.year ? " (" + p.year + ")" : "");
    $("im-desc").textContent = p.wpx || p.desc || ch.tagline || "";
    $("im-credits").textContent = [
      p.dir?.length ? "directed by " + p.dir.join(", ") : null,
      p.cast?.length ? "with " + p.cast.join(", ") : null,
      p.wpx ? "— Wikipedia, CC BY-SA" : null
    ].filter(Boolean).join(" · ");
    const box = $("im-threads");
    box.innerHTML = "";
    threadsFor(state.chIndex, info.index).forEach((t) => {
      const row = document.createElement("button");
      row.className = "im-thread";
      row.textContent = "⤳ " + t.label;
      row.addEventListener("click", () => {
        hideIntermission();
        crtBlink();
        tune(t.ci, { fromStartProg: t.pi });
      });
      box.appendChild(row);
    });
    const live = scheduleFor(ch);
    if (info.live && live.index !== info.index) {
      $("im-live").textContent = "meanwhile, live on " + ch.name + ": " + live.program.title;
      $("im-live").classList.remove("hidden");
    } else {
      $("im-live").classList.add("hidden");
    }
    $("intermission").classList.remove("hidden");
}

function hideIntermission() {
  $("intermission").classList.add("hidden");
}

/* stateless arming: the heartbeat shows the card once a pause has truly
   settled (>6s), so no event-ordering race can eat it */
[$("tv-a"), $("tv-b")].forEach((el) => {
  el.addEventListener("pause", (e) => { if (e.target === video && state.on) state.pausedSince = Date.now(); });
  el.addEventListener("play", (e) => { if (e.target === video) { state.pausedSince = null; hideIntermission(); } });
});
$("intermission").addEventListener("click", (e) => {
  if (e.target === $("intermission")) hideIntermission();
});

/* ── deep links: bookmarkable SPA URIs ──────────────
 *   #ia:<archive-identifier>  → that program, from the start
 *   #ch:<channel-id>          → that channel, live
 * The address bar tracks what you're watching (replaceState, so no
 * history spam), which makes every program shareable. */

const itemOf = (prog) => (prog.src || "").match(/archive\.org\/download\/([^/]+)\//)?.[1] || null;

function findByItem(id) {
  for (let ci = 0; ci < CHANNELS.length; ci++) {
    const pi = CHANNELS[ci].programs.findIndex((p) => itemOf(p) === id);
    if (pi >= 0) return { ci, pi };
  }
  return null;
}

function reflectHash() {
  try {
    const info = currentProgramInfo();
    const h = info.live
      ? "#ch:" + currentChannel().id
      : "#ia:" + (itemOf(info.program) || "");
    history.replaceState(null, "", h);
  } catch {}
}

function parseHash() {
  const h = decodeURIComponent(location.hash || "");
  let m = h.match(/^#ia:(.+)$/);
  if (m) { const hit = findByItem(m[1]); if (hit) return { kind: "ia", ...hit }; }
  m = h.match(/^#ch:(.+)$/);
  if (m) {
    const ci = CHANNELS.findIndex((c) => c.id === m[1] || String(c.num) === m[1]);
    if (ci >= 0) return { kind: "ch", ci };
  }
  return null;
}

let pendingDeepLink = parseHash();
if (pendingDeepLink) {
  state.chIndex = pendingDeepLink.ci;
  if (pendingDeepLink.kind === "ia") {
    const p = CHANNELS[pendingDeepLink.ci].programs[pendingDeepLink.pi];
    document.querySelector(".splash-hint").textContent =
      "tap to play: " + p.title + (p.year ? " (" + p.year + ")" : "");
  }
}

window.addEventListener("hashchange", () => {
  if (!state.on) return;
  const t = parseHash();
  if (!t) return;
  crtBlink();
  if (t.kind === "ia") tune(t.ci, { fromStartProg: t.pi });
  else tune(t.ci);
});

$("info-share").addEventListener("click", async () => {
  reflectHash();
  const url = location.href;
  const info = currentProgramInfo();
  const title = info.program.title + " — TVP/2007";
  try {
    if (navigator.share) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url);
    chatPush(null, "link copied: " + url, "sys");
  } catch {}
});

/* ── full reset: for when the set feels clagged up ── */

$("splash-reset").addEventListener("click", async () => {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("tvp.")).forEach((k) => localStorage.removeItem(k));
    navigator.serviceWorker?.controller?.postMessage({ type: "nuke" });
    const regs = await (navigator.serviceWorker?.getRegistrations?.() || []);
    for (const r of regs) await r.unregister();
  } catch {}
  setTimeout(() => location.replace(location.pathname), 300);   // drop hash, reload clean
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
renderPreload();
renderTickerToggle();
renderBuddyToggle();
registerSW();

/* While the splash breathes, quietly buffer what's on the saved channel
 * right now — power-on then swaps to an already-warm stream. */
(function warmTheValves() {
  try {
    const s = scheduleFor(CHANNELS[state.chIndex]);
    preloadBackstage(fastSrc(s.program), s.offset);
  } catch {}
})();
