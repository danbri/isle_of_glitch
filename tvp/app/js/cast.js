/*
 * TVP/2007 — send the picture to the television. 📺
 *
 * Two transports, one button:
 *
 *  Chromecast (Chrome/Edge on desktop + Android) — the Google Cast
 *  sender SDK casts the current program to the default media receiver
 *  (archive.org MP4s play natively). The session follows the dial.
 *
 *  AirPlay (Safari on iOS/macOS) — Safari has no Cast API at all, so on
 *  WebKit the same button opens the system AirPlay picker for the active
 *  <video> instead. No SDK involved.
 *
 * initCast(bridge, reveal): `reveal(api)` fires whenever a transport
 * becomes usable — including a slow-loading Cast SDK arriving late — so
 * the button can appear the moment there's something behind it. The api
 * reports which transport via .kind.
 */

/* global cast, chrome */

export function initCast(bridge, reveal) {
  /* ── AirPlay lane (WebKit) ── */
  if (window.WebKitPlaybackTargetAvailabilityEvent) {
    let revealed = false;
    const watch = (v) => {
      if (!v?.addEventListener) return;
      v.addEventListener("webkitplaybacktargetavailabilitychanged", (e) => {
        if (e.availability === "available" && !revealed) {
          revealed = true;
          reveal({
            kind: "airplay",
            get casting() { return false; },   // WebKit routes; the page keeps playing
            prompt() { try { bridge.getVideos().find((x) => !x.paused || x === bridge.getVideos()[0])?.webkitShowPlaybackTargetPicker(); } catch {} },
            tuned() {}, playPause() { return false; }
          });
        }
      });
    };
    bridge.getVideos().forEach(watch);
  }

  /* ── Chromecast lane (Blink) ── */
  if (!("chrome" in window)) return;
  window.__onGCastApiAvailable = (ok) => {
    if (!ok) { bridge.note?.("cast: sender API reported unavailable"); return; }
    try { reveal(wire(bridge)); }
    catch (e) { bridge.note?.("cast: sender wiring failed — " + String(e).slice(0, 80)); }
  };
  const s = document.createElement("script");
  s.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
  s.onerror = () => bridge.note?.("cast: sender SDK blocked or unreachable (extension/adblock/network?)");
  document.head.appendChild(s);
}

function wire(bridge) {
  const ctx = cast.framework.CastContext.getInstance();
  // The device picker is Google's UI, filtered by the RECEIVER app's
  // declared capabilities — and the Default Media Receiver declares
  // audio-only-device support, so every speaker on the network shows up.
  // Registering a Styled Media Receiver (Cast developer console) with
  // "supports audio only devices" left unchecked filters the picker to
  // video targets; drop its app id in:
  //   localStorage.setItem('tvp.castAppId', JSON.stringify('XXXXXXXX'))
  let appId = "";
  try { appId = JSON.parse(localStorage.getItem("tvp.castAppId") || '""'); } catch {}
  ctx.setOptions({
    receiverApplicationId: appId || chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
  });

  // surface device discovery, once per transition — the button exists
  // even with zero devices; this tells the user which world they're in
  let lastState = "";
  ctx.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, (e) => {
    const st = e.castState;
    if (st === lastState) return;
    lastState = st;
    const C = cast.framework.CastState;
    if (st === C.NO_DEVICES_AVAILABLE) bridge.note?.("cast: no devices found on this network");
    else if (st === C.NOT_CONNECTED) bridge.note?.("cast: device(s) available — tap the cast button");
  });

  const player = new cast.framework.RemotePlayer();
  const rc = new cast.framework.RemotePlayerController(player);
  let casting = false;

  ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
    const S = cast.framework.SessionState;
    if (e.sessionState === S.SESSION_STARTED || e.sessionState === S.SESSION_RESUMED) {
      casting = true;
      const dev = ctx.getCurrentSession()?.getCastDevice();
      bridge.onCastStart(dev?.friendlyName || "TV");
      // an audio-only pick (speaker, speaker group) deserves a heads-up
      const caps = dev?.capabilities || [];
      if (caps.length && !caps.some((c) => /video/i.test(String(c)))) {
        bridge.warn?.(`${dev?.friendlyName || "That device"} is audio-only — sound without picture`);
      }
      load();
    }
    if (e.sessionState === S.SESSION_ENDED) {
      casting = false;
      bridge.onCastEnd(player.currentTime || 0);
    }
  });

  function load() {
    const session = ctx.getCurrentSession();
    if (!session) return;
    const { url, title, art, offset } = bridge.getMedia();
    const info = new chrome.cast.media.MediaInfo(url, "video/mp4");
    info.metadata = new chrome.cast.media.MovieMediaMetadata();
    info.metadata.title = title;
    if (art) info.metadata.images = [new chrome.cast.Image(art)];
    const req = new chrome.cast.media.LoadRequest(info);
    req.currentTime = Math.max(0, offset || 0);
    req.autoplay = true;
    session.loadMedia(req).catch(() => {});
  }

  return {
    kind: "chromecast",
    get casting() { return casting; },
    prompt() { ctx.requestSession().catch(() => {}); },
    tuned() { if (casting) load(); },
    playPause() { if (casting) rc.playOrPause(); return casting; },
    seekBy(d) {
      if (!casting) return;
      player.currentTime = Math.max(0, (player.currentTime || 0) + d);
      rc.seek();
    },
    remoteTime() { return player.currentTime || 0; }
  };
}
