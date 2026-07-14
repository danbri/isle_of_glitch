/*
 * TVP/2007 — Chromecast sender. 📺
 *
 * Lazy ES module: loaded only in browsers that expose the Cast API
 * surface (Chrome/Edge on desktop and Android). Casts the current
 * program to the default media receiver — archive.org's MP4 derivatives
 * play natively on Cast devices — and keeps the session following the
 * dial: channel flips load the new program at its live offset.
 *
 * While a session is up, local playback pauses (the TV is the TV);
 * ending the session hands the stream back to the page at the remote
 * position. Exports initCast(bridge) → api or null.
 */

/* global cast, chrome */

export function initCast(bridge) {
  return new Promise((resolve) => {
    if (!("chrome" in window)) return resolve(null);
    window.__onGCastApiAvailable = (ok) => {
      if (!ok) return resolve(null);
      try { resolve(wire(bridge)); } catch { resolve(null); }
    };
    const s = document.createElement("script");
    s.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(() => resolve(null), 12000);   // belt: never leave the app waiting
  });
}

function wire(bridge) {
  const ctx = cast.framework.CastContext.getInstance();
  ctx.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
  });

  const player = new cast.framework.RemotePlayer();
  const rc = new cast.framework.RemotePlayerController(player);
  let casting = false;

  ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
    const S = cast.framework.SessionState;
    if (e.sessionState === S.SESSION_STARTED || e.sessionState === S.SESSION_RESUMED) {
      casting = true;
      bridge.onCastStart(ctx.getCurrentSession()?.getCastDevice()?.friendlyName || "TV");
      load();                                      // put the current program up
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
    get casting() { return casting; },
    /* the dial moved: follow it on the big screen */
    tuned() { if (casting) load(); },
    playPause() { if (casting) rc.playOrPause(); },
    seekBy(d) {
      if (!casting) return;
      player.currentTime = Math.max(0, (player.currentTime || 0) + d);
      rc.seek();
    },
    remoteTime() { return player.currentTime || 0; },
    paused() { return player.isPaused; }
  };
}
