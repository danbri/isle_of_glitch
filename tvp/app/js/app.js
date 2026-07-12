/*
 * TVP/2007 — a Joost-era web TV revival (original code).
 *
 * The conceit: channels run on a wall clock anchored to 16 Jan 2007.
 * You never "open a file" — you tune a channel and join whatever is
 * on right now, exactly like the old client (and old television).
 */

"use strict";

/* ── tiny helpers ──────────────────────────────────── */

const $ = (id) => document.getElementById(id);
const video = $("tv");

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

/* Upcoming listing for the EPG: current program + the next few, with start times. */
function listingFor(ch, count = 4) {
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
  chIndex: store.get("channel", 0),
  onDemand: null,          // {chIndex, progIndex} when playing from start
  favs: new Set(store.get("favs", [])),
  ratings: store.get("ratings", {}),
  category: "explore",
  overlayTimer: null,
  comingUpShown: false,
  digitBuffer: "",
  digitTimer: null,
  tuneToken: 0
};

/* ── CRT power effect ──────────────────────────────── */

function crt(mode, done) {
  const el = $("crt");
  el.classList.remove("on", "off");
  void el.offsetWidth;                       // restart animation
  el.classList.add(mode);
  const dot = $("crt-dot");
  dot.style.animation = "none";
  void dot.offsetWidth;
  dot.style.animation = "";
  const ms = mode === "off" ? 460 : 520;
  setTimeout(() => { el.classList.remove(mode); done && done(); }, ms);
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

  // interstitial
  $("interstitial-text").textContent = "Fetching your channel…";
  $("interstitial-channel").textContent = ch.num + " · " + ch.name;
  $("interstitial").classList.remove("hidden");
  state.comingUpShown = false;
  $("comingup").classList.add("hidden");

  video.src = prog.src;
  const onMeta = () => {
    if (token !== state.tuneToken) return;
    if (offset > 1 && offset < prog.dur - 2) {
      try { video.currentTime = offset; } catch {}
    }
  };
  video.addEventListener("loadedmetadata", onMeta, { once: true });

  const onReady = () => {
    if (token !== state.tuneToken) return;
    $("interstitial").classList.add("hidden");
    updateInfo();
    if (state.zapQuiet) {
      state.zapQuiet = false;
      showOSDChannel();        // blind zap: just the big channel number
    } else {
      showOverlays();
    }
  };
  video.addEventListener("playing", onReady, { once: true });

  // keep the user gesture: call play() synchronously
  const p = video.play();
  if (p) p.catch(() => { /* autoplay refusal handled by tap-to-play overlay state */ });

  updateInfo();
  renderEPGChannels();
  renderJewels();
  chatOnZap(ch, prog);
}

function zap(delta) {
  state.zapQuiet = !overlaysVisible();
  crtBlink();
  tune(state.chIndex + delta);
}

function crtBlink() {
  // quick horizontal-collapse flicker between channels
  const el = $("crt");
  el.classList.remove("on", "off");
  void el.offsetWidth;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 300);
}

/* program end → rejoin the broadcast schedule (which now points at the next show) */
video.addEventListener("ended", () => { if (state.on) tune(state.chIndex); });

video.addEventListener("error", () => {
  if (!state.on) return;
  $("interstitial-text").textContent = "Channel hiccup — re-tuning…";
  $("interstitial").classList.remove("hidden");
  const tk = state.tuneToken;
  setTimeout(() => { if (state.on && tk === state.tuneToken) tune(state.chIndex); }, 3500);
});

/* ── overlays: info bar + controller ───────────────── */

function updateInfo() {
  const ch = currentChannel();
  const info = currentProgramInfo();
  $("info-channel").textContent = ch.num + " · " + ch.name;
  $("info-title").textContent = info.program.title + " (" + info.program.year + ")";
  const live = info.live
    ? "LIVE · ends " + clock12(new Date(Date.now() + (info.remaining || 0) * 1000))
    : "on demand · from the start";
  $("info-meta").textContent = live + " · " + info.program.license;
  $("info-art").src = ch.art;
  $("time-total").textContent = fmt(info.program.dur);
}

function overlaysVisible() { return !$("controller").classList.contains("hidden"); }

function showOverlays() {
  $("controller").classList.remove("hidden");
  $("infobar").classList.remove("hidden");
  if (matchMedia("(hover:hover)").matches) $("volume").classList.remove("hidden");
  armOverlayTimer();
}
function hideOverlays() {
  $("controller").classList.add("hidden");
  $("infobar").classList.add("hidden");
  $("volume").classList.add("hidden");
}
function armOverlayTimer() {
  clearTimeout(state.overlayTimer);
  state.overlayTimer = setTimeout(() => {
    if (!video.paused) hideOverlays();
    else armOverlayTimer();
  }, 4500);
}
function toggleOverlays() { overlaysVisible() ? hideOverlays() : showOverlays(); }

/* progress + coming-up loop */
setInterval(() => {
  if (!state.on) return;
  const info = currentProgramInfo();
  const dur = info.program.dur;
  const t = video.currentTime || 0;
  $("time-now").textContent = fmt(t);
  const pct = Math.min(100, (t / dur) * 100);
  $("progress-fill").style.width = pct + "%";
  $("progress-handle").style.left = pct + "%";

  // "coming up" ~25s before the end of the current program
  const remaining = dur - t;
  if (remaining < 25 && remaining > 3 && !state.comingUpShown && !video.paused) {
    state.comingUpShown = true;
    const ch = currentChannel();
    const next = listingFor(ch, 2)[1] || listingFor(ch, 1)[0];
    $("comingup-title").textContent = next.program.title;
    $("comingup").classList.remove("hidden");
    setTimeout(() => $("comingup").classList.add("hidden"), 8000);
  }
  if (remaining >= 25) state.comingUpShown = false;

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
  bar.style.width = (video.muted ? 0 : video.volume * 100) + "%";
  $("osd-volume").classList.remove("hidden");
  clearTimeout(volTimer);
  volTimer = setTimeout(() => $("osd-volume").classList.add("hidden"), 1400);
}

/* ── controller buttons ────────────────────────────── */

$("btn-play").addEventListener("click", () => {
  if (video.paused) video.play(); else video.pause();
  armOverlayTimer();
});
video.addEventListener("play", () => { $("glyph-play").classList.add("hidden"); $("glyph-pause").classList.remove("hidden"); });
video.addEventListener("pause", () => { $("glyph-pause").classList.add("hidden"); $("glyph-play").classList.remove("hidden"); });

$("btn-prev").addEventListener("click", () => zap(-1));
$("btn-next").addEventListener("click", () => zap(+1));

$("btn-mute").addEventListener("click", () => {
  video.muted = !video.muted;
  $("spk-wave").style.opacity = video.muted ? 0 : 1;
  $("btn-mute").classList.toggle("lit", video.muted);
  showOSDVolume();
  armOverlayTimer();
});

$("volume").addEventListener("input", (e) => {
  video.volume = parseFloat(e.target.value);
  video.muted = false;
  showOSDVolume();
});

$("btn-fs").addEventListener("click", () => {
  const root = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (root.requestFullscreen) root.requestFullscreen();
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
  armOverlayTimer();
});

$("btn-menu").addEventListener("click", () => openDrawer("epg"));
$("btn-widgets").addEventListener("click", () => openDrawer("dock"));
$("btn-search").addEventListener("click", () => openDrawer("search"));

$("btn-power").addEventListener("click", powerOff);
$("info-restart").addEventListener("click", () => {
  const info = currentProgramInfo();
  tune(state.chIndex, { fromStartProg: info.index });
});

/* ── power ─────────────────────────────────────────── */

function powerOn() {
  state.on = true;
  $("splash").classList.add("hidden");
  crt("on");
  tune(state.chIndex);
  startClock();
  startTicker();
}

function powerOff() {
  state.on = false;
  hideOverlays();
  closeDrawers();
  crt("off", () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    $("interstitial").classList.add("hidden");
    $("splash").classList.remove("hidden");
  });
}

$("power-on").addEventListener("click", powerOn);

/* ── drawers ───────────────────────────────────────── */

function openDrawer(which) {
  closeDrawers();
  hideOverlays();
  if (which === "search") {
    $("search").classList.add("open");
    renderSearch($("search-input").value);
    setTimeout(() => $("search-input").focus(), 250);
  } else {
    $(which).classList.add("open");
    if (which === "epg") { renderEPGCats(); renderEPGChannels(); }
  }
  document.body.classList.add("drawer-open");
}
function closeDrawers() {
  ["epg", "dock", "search"].forEach((id) => $(id).classList.remove("open"));
  document.body.classList.remove("drawer-open");
}
$("scrim").addEventListener("click", closeDrawers);
document.querySelectorAll(".drawer-close").forEach((b) =>
  b.addEventListener("click", () => closeDrawers()));

/* ── EPG ───────────────────────────────────────────── */

function renderEPGCats() {
  const nav = $("epg-cats");
  nav.innerHTML = "";
  EPG_CATEGORIES.forEach((c) => {
    const has = c.id === "explore" || c.id === "my" || CHANNELS.some((ch) => ch.category === c.id);
    if (!has) return;
    const b = document.createElement("button");
    b.className = "cat" + (state.category === c.id ? " active" : "");
    b.textContent = c.label;
    b.addEventListener("click", () => { state.category = c.id; renderEPGCats(); renderEPGChannels(); });
    nav.appendChild(b);
  });
}

function channelsInCategory() {
  if (state.category === "explore") return CHANNELS;
  if (state.category === "my") return CHANNELS.filter((ch) => state.favs.has(ch.id));
  return CHANNELS.filter((ch) => ch.category === state.category);
}

function renderEPGChannels() {
  const box = $("epg-channels");
  if (!$("epg").classList.contains("open")) return;
  box.innerHTML = "";
  const chans = channelsInCategory();
  if (!chans.length) {
    box.innerHTML = '<div class="search-empty">No channels here yet — tap ★ on a channel to add it to My Channels.</div>';
    return;
  }
  chans.forEach((ch) => {
    const card = document.createElement("div");
    card.className = "epg-channel" + (CHANNELS[state.chIndex] === ch ? " playing" : "");

    const listing = listingFor(ch, 4);
    const now = listing[0], next = listing[1];

    const head = document.createElement("div");
    head.className = "epg-channel-head";
    head.innerHTML = `
      <img src="${ch.art}" alt="" loading="lazy">
      <div class="epg-ch-text">
        <div class="epg-ch-name"><span class="chnum">${ch.num}</span>${ch.name}</div>
        <div class="epg-ch-now">Now: <b>${now.program.title}</b>${next ? " · next " + clock12(new Date(next.startMs)) : ""}</div>
      </div>`;
    const fav = document.createElement("button");
    fav.className = "fav-btn" + (state.favs.has(ch.id) ? " on" : "");
    fav.textContent = "★";
    fav.title = "My Channels";
    fav.addEventListener("click", (e) => {
      e.stopPropagation();
      state.favs.has(ch.id) ? state.favs.delete(ch.id) : state.favs.add(ch.id);
      store.set("favs", [...state.favs]);
      renderEPGChannels();
    });
    head.appendChild(fav);
    head.addEventListener("click", () => { closeDrawers(); crtBlink(); tune(CHANNELS.indexOf(ch)); });
    card.appendChild(head);

    const progs = document.createElement("div");
    progs.className = "epg-programs";
    listing.forEach((slot) => {
      const row = document.createElement("div");
      row.className = "epg-prog" + (slot.live ? " now" : "");
      row.innerHTML = `<span class="t">${clock12(new Date(slot.startMs))}</span>
        <span class="n">${slot.program.title}</span>${slot.live ? '<span class="live">LIVE</span>' : ""}`;
      row.addEventListener("click", () => {
        closeDrawers(); crtBlink();
        if (slot.live) tune(CHANNELS.indexOf(ch));
        else tune(CHANNELS.indexOf(ch), { fromStartProg: slot.index });
      });
      progs.appendChild(row);
    });
    card.appendChild(progs);
    box.appendChild(card);
  });
}

/* ── search ────────────────────────────────────────── */

function renderSearch(q) {
  const box = $("search-results");
  q = (q || "").trim().toLowerCase();
  box.innerHTML = "";
  if (!q) {
    box.innerHTML = '<div class="search-empty">Try “bunny”, “zombie”, “moon”…</div>';
    return;
  }
  let hits = 0;
  CHANNELS.forEach((ch) => {
    ch.programs.forEach((p, pi) => {
      const hay = (ch.name + " " + p.title + " " + p.desc + " " + ch.category).toLowerCase();
      if (!hay.includes(q)) return;
      hits++;
      const live = scheduleFor(ch).index === pi;
      const el = document.createElement("div");
      el.className = "sr";
      el.innerHTML = `<img src="${ch.art}" alt="" loading="lazy">
        <div><div class="sr-title">${p.title} (${p.year})</div>
        <div class="sr-sub">${ch.num} · ${ch.name}${live ? ' · <span class="onair">ON AIR</span>' : " · plays from start"}</div></div>`;
      el.addEventListener("click", () => {
        closeDrawers(); crtBlink();
        live ? tune(CHANNELS.indexOf(ch)) : tune(CHANNELS.indexOf(ch), { fromStartProg: pi });
      });
      box.appendChild(el);
    });
  });
  if (!hits) box.innerHTML = `<div class="search-empty">Your search for “${q}” did not match any programs.</div>`;
}
$("search-input").addEventListener("input", (e) => renderSearch(e.target.value));
$("search-form").addEventListener("submit", (e) => e.preventDefault());

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
  if (v) $("jewel-caption").textContent = "you rated this " + v + "/5";
  else $("jewel-caption").textContent = "tap a jewel";
}

/* ── widgets: channel chat (a friendly séance) ─────── */

const CHAT_BOTS = ["venice_fan", "p2p_pete", "beta_tester07", "couch_potato", "sleepy_llama", "dialup_dora"];
const CHAT_LINES = [
  "anyone else watching {show}? ☺",
  "this channel is my new favourite",
  "wow, {show} looks great tonight",
  "greetings from 2007! my invite token finally arrived",
  "brb, buffering",
  "you can rate it with the jewels widget →",
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
  const log = $("chat-log");
  log.innerHTML = "";
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
  "<b>ON THIS NETWORK:</b> all channels stream free &amp; open video from archive.org",
  "<b>2007:</b> The Venice Project relaunches as “Joost” after buying the domain for a reported $75,000",
  "<b>2007:</b> a phone with no keyboard is announced in January; pundits unconvinced",
  "<b>BLENDER:</b> open movies on channels 1 &amp; 2 are CC-BY — remix them!",
  "<b>TIP:</b> press 1–7 on a keyboard to zap straight to a channel",
  "<b>TIP:</b> swipe from the left edge for the channel guide, right edge for widgets",
  "<b>PRELINGER:</b> Bert the Turtle still knows what to do — duck and cover (ch 6)",
  "<b>MOON TV:</b> the 1969 EVA broadcast loops forever on channel 7",
  "<b>NOSTALGIA:</b> no P2P engine was harmed in this reconstruction"
];

function startTicker() {
  const on = store.get("ticker", true);
  $("ticker").classList.toggle("hidden", !on);
  $("ticker-track").innerHTML = TICKER_ITEMS.map((t) => `<span>${t}</span>`).join("");
}

/* ticker toggle lives in the widget dock */
(function addTickerWidget() {
  const sec = document.createElement("section");
  sec.className = "widget";
  sec.innerHTML = '<h3>news ticker</h3>';
  const btn = document.createElement("button");
  btn.className = "pill-btn";
  const label = () => (store.get("ticker", true) ? "ticker: on — tap to hide" : "ticker: off — tap to show");
  btn.textContent = label();
  btn.addEventListener("click", () => {
    store.set("ticker", !store.get("ticker", true));
    btn.textContent = label();
    startTicker();
  });
  sec.appendChild(btn);
  $("w-notice").before(sec);
})();

/* ── stage gestures (mobile first) ─────────────────── */

(function wireGestures() {
  const stage = $("stage");
  let t0 = null;

  stage.addEventListener("touchstart", (e) => {
    if (e.target.closest(".overlay, .osd, button, input, #interstitial, #splash")) { t0 = null; return; }
    const t = e.changedTouches[0];
    t0 = { x: t.clientX, y: t.clientY, ms: Date.now(), edgeL: t.clientX < 24, edgeR: t.clientX > innerWidth - 24 };
  }, { passive: true });

  stage.addEventListener("touchend", (e) => {
    if (!t0 || !state.on) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - t0.x, dy = t.clientY - t0.y, dt = Date.now() - t0.ms;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (dt < 700 && absX > 60 && absX > absY * 1.5) {
      if (t0.edgeL && dx > 0) return openDrawer("epg");       // swipe in from left
      if (t0.edgeR && dx < 0) return openDrawer("dock");      // swipe in from right
    }
    if (dt < 700 && absY > 70 && absY > absX * 1.5) {
      return zap(dy < 0 ? +1 : -1);                           // swipe up/down = zap
    }
    if (absX < 12 && absY < 12) toggleOverlays();             // tap
    t0 = null;
  }, { passive: true });

  // desktop: click toggles, mousemove shows
  stage.addEventListener("click", (e) => {
    if (!state.on) return;
    if (e.target.closest(".overlay, .osd, button, input, #interstitial, #splash")) return;
    if (matchMedia("(hover:hover)").matches || e.pointerType === "mouse") toggleOverlays();
  });
  stage.addEventListener("mousemove", () => {
    if (state.on && matchMedia("(hover:hover)").matches && !overlaysVisible()) showOverlays();
  });
})();

/* ── keyboard (the desktop remote) ─────────────────── */

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input")) {
    if (e.key === "Escape") { e.target.blur(); closeDrawers(); }
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
    case "w": openDrawer("dock"); break;
    case "g": case "e": openDrawer("epg"); break;
    case "/": e.preventDefault(); openDrawer("search"); break;
    case "p": powerOff(); break;
    case "Escape": closeDrawers(); break;
    case "+": case "=": video.volume = Math.min(1, video.volume + .1); showOSDVolume(); break;
    case "-": video.volume = Math.max(0, video.volume - .1); showOSDVolume(); break;
    default:
      if (/^[1-9]$/.test(e.key)) {
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

/* ── art fallback: draw our own test card when archive.org art is unreachable ── */

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

renderEPGCats();
