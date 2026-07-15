/*
 * TVP/2007 — venue mode. 🍿
 *
 * Five little worlds around the live channel: a 1950s drive-in, a
 * synthwave space lounge, a gilded picture palace, a crystal grotto and
 * a 2007 rec room. Everything is generated — no assets are downloaded
 * (three.js itself is vendored and loaded on first use).
 *
 * How the picture gets into the world — archive.org media carries no
 * CORS headers, so the <video> is "tainted": WebGL is forbidden from
 * sampling it. Instead of a texture, the actual video element is
 * composited INTO the scene: a colour-silent, depth-writing quad punches
 * a transparent hole in the WebGL canvas exactly where the screen is,
 * and a per-frame homography (CSS matrix3d) pins the DOM video to that
 * quad. Geometry in front still occludes the picture; nothing ever reads
 * a pixel.
 *
 * How the picture lights the world — the lineup's frame still for the
 * program IS CORS-clean (served via archive.org/cors/), so its dominant
 * tones are extracted and slowly crossfaded to drive each venue's screen
 * glow: coloured point lights (specular highlights on glass, gold, bar
 * tops, water) and volumetric air — projector beams and screen-glow
 * frustums with animated wisps.
 *
 * In WebXR the DOM trick can't follow you inside the headset; the screen
 * falls back to an ambient tone-wash unless the stream happens to be
 * CORS-clean (then it becomes a real VideoTexture).
 */

import * as THREE from "../vendor/three.module.min.js";

const SCENE_DEFS = [];

/* ── homography: map a DOM rect onto 4 projected screen-space points ── */
function adj3(m) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
  ];
}
function mul3(a, b) {
  const r = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
function basis(p) {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
  const a = adj3(m), q = p[3];
  const v = [
    a[0] * q[0] + a[1] * q[1] + a[2],
    a[3] * q[0] + a[4] * q[1] + a[5],
    a[6] * q[0] + a[7] * q[1] + a[8]
  ];
  return mul3(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
function homography(src, dst) {
  const h = mul3(basis(dst), adj3(basis(src)));
  return h.map((x) => x / h[8]);
}

/* ── dominant tones from the program's (CORS-clean) frame still ── */
async function extractTones(url) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((res, rej) => {
    img.onload = res; img.onerror = rej;
    img.src = url;
    setTimeout(rej, 8000);
  });
  const c = document.createElement("canvas");
  c.width = 48; c.height = 27;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, 48, 27);
  const d = x.getImageData(0, 0, 48, 27).data;
  const buckets = new Map();
  let lum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    lum += l; n++;
    const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    if (s < 0.16 || l < 0.07 || l > 0.96) continue;
    let h = mx === r ? (((g - b) / (mx - mn)) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    h = Math.round(h * 2) % 12;
    const e = buckets.get(h) || { w: 0, r: 0, g: 0, b: 0 };
    const wgt = 0.3 + s;
    e.w += wgt; e.r += r * wgt; e.g += g * wgt; e.b += b * wgt;
    buckets.set(h, e);
  }
  const top = [...buckets.values()].sort((a, b) => b.w - a.w).slice(0, 3)
    .map((e) => {
      const col = new THREE.Color(e.r / e.w, e.g / e.w, e.b / e.w);
      const hsl = {}; col.getHSL(hsl);
      col.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.min(0.72, Math.max(0.38, hsl.l)));
      return col;
    });
  while (top.length < 3) top.push(new THREE.Color(0x8fa8c8));   // cool tube-light default
  return { tones: top, lum: n ? lum / n : 0.45 };
}

/* ── glow volumes: soft additive light-in-the-air, tinted per frame ── */
function glowMaterial(k) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(0x8fa8c8) }, t: { value: 0 }, k: { value: k } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform vec3 c; uniform float t, k;
      void main(){
        float along = vUv.y;
        float body = pow(smoothstep(0., .25, along) * smoothstep(1., .55, along), 1.2);
        float wisp = .75 + .25*sin(vUv.x*28.+t*1.7)*sin(along*17.-t*2.3);
        gl_FragColor = vec4(c, k * body * wisp);
      }`
  });
}

/* A projector beam is a RECTANGULAR frustum: apex rect (w0×h0) at the
 * lens, far rect (w1×h1) — the SCREEN'S OWN width and height — where the
 * light lands. Local -Z is the throw axis: put the mesh at the lens and
 * lookAt() the screen centre, and the beam's edges meet the screen's
 * edges exactly. uv.y runs 1 at the lens → 0 at the screen. */
function beamFrustum(w0, h0, w1, h1, len, k) {
  const near = [[-w0 / 2, h0 / 2], [w0 / 2, h0 / 2], [w0 / 2, -h0 / 2], [-w0 / 2, -h0 / 2]];
  const far = [[-w1 / 2, h1 / 2], [w1 / 2, h1 / 2], [w1 / 2, -h1 / 2], [-w1 / 2, -h1 / 2]];
  const pos = [], uv = [], idx = [];
  for (let s = 0; s < 4; s++) {
    const a = near[s], b = near[(s + 1) % 4], A = far[s], B = far[(s + 1) % 4];
    const base = pos.length / 3;
    pos.push(a[0], a[1], 0, b[0], b[1], 0, B[0], B[1], -len, A[0], A[1], -len);
    uv.push(0, 1, 1, 1, 1, 0, 0, 0);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = glowMaterial(k);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.k = k;
  return { mesh, mat };
}

/* legacy soft cone, still right for shapeless spill (water shimmer etc.) */
function glowVolume(rTop, rBottom, length, k) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, 18, 10, true);
  const mat = glowMaterial(k);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.k = k;
  return { mesh, mat };
}

export function launchScenes(bridge, startId) {
  const mount = document.createElement("div");
  mount.id = "venue";
  document.body.appendChild(mount);
  document.body.classList.add("in-venue");

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);         // transparent: the DOM video shows through the punched hole
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.xr.enabled = true;
  mount.appendChild(renderer.domElement);

  /* the hole punch: writes depth, writes no colour */
  function punchMaterial() {
    const m = new THREE.MeshBasicMaterial();
    m.colorWrite = false;
    return m;
  }
  function screenAssembly(w, frameColor = 0x111111, frameDepth = 0.12) {
    const h = w * 9 / 16;
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.26, h + 0.26, frameDepth),
      new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.8 })
    );
    // a soft emissive rim so screens read as lit hardware, not cardboard
    const rim = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.6, h + 0.6),
      new THREE.MeshBasicMaterial({ color: 0x8fa8c8, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    rim.position.z = frameDepth / 2 - 0.01;
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(w, h), punchMaterial());
    hole.userData.punchMat = hole.material;
    hole.position.z = frameDepth / 2 + 0.006;
    hole.renderOrder = -10;                    // punch before anything transparent blends
    grp.add(frame, rim, hole);
    grp.userData.size = [w, h];
    grp.userData.hole = hole;
    grp.userData.rim = rim;
    return grp;
  }

  const ctx = { THREE, canvasTex, stars, motes, screenAssembly, glowVolume, beamFrustum };

  /* ── camera rig ── */
  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, 400);
  const dolly = new THREE.Group();
  dolly.add(camera);
  let yaw = 0, pitch = 0, dist = 0;
  const look = { drag: false, x: 0, y: 0, pinch: 0 };
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { look.drag = true; look.x = e.clientX; look.y = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => {
    if (!look.drag) return;
    yaw -= (e.clientX - look.x) * 0.0042;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - look.y) * 0.0042));
    look.x = e.clientX; look.y = e.clientY;
  });
  el.addEventListener("pointerup", () => { look.drag = false; });
  el.addEventListener("wheel", (e) => { dist = Math.max(-2, Math.min(6, dist + e.deltaY * 0.004)); e.preventDefault(); }, { passive: false });
  el.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (look.pinch) dist = Math.max(-2, Math.min(6, dist + (look.pinch - d) * 0.01));
      look.pinch = d;
    }
  }, { passive: true });
  el.addEventListener("touchend", () => { look.pinch = 0; });

  /* ── overlay UI ── */
  const ui = document.createElement("div");
  ui.id = "venue-ui";
  ui.innerHTML = `
    <div id="venue-bug"></div>
    <button id="venue-exit" title="Back to 2D (x)">✕</button>
    <div id="venue-pick" title="swipe to change venue">
      <div id="vp-label"><span id="vp-emoji"></span><span id="vp-name"></span></div>
      <div id="vp-dots"></div>
    </div>
    <button id="venue-vr" class="hidden">Enter VR</button>`;
  mount.appendChild(ui);
  const dots = ui.querySelector("#vp-dots");
  SCENE_DEFS.forEach((d) => {
    const b = document.createElement("button");
    b.className = "vp-dot";
    b.dataset.id = d.id;
    b.title = d.name;
    dots.appendChild(b);
  });
  // swipe the pill like a carousel; tap a dot to jump; a plain tap nudges
  // to the next venue. Pointer capture retargets pointerup, so every
  // decision comes from what the POINTERDOWN landed on.
  const pick = ui.querySelector("#venue-pick");
  let swipeX = null, swipeT = null;
  pick.addEventListener("pointerdown", (e) => {
    swipeX = e.clientX;
    swipeT = e.target;
    pick.setPointerCapture(e.pointerId);
  });
  pick.addEventListener("pointerup", (e) => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    const t = swipeT;
    swipeX = null; swipeT = null;
    if (Math.abs(dx) > 36) stepScene(dx < 0 ? 1 : -1);
    else if (t?.classList?.contains("vp-dot")) setScene(t.dataset.id);
    else stepScene(1);
  });
  ui.querySelector("#venue-exit").addEventListener("click", exit);

  navigator.xr?.isSessionSupported?.("immersive-vr").then((ok) => {
    if (!ok) return;
    const vb = ui.querySelector("#venue-vr");
    vb.classList.remove("hidden");
    vb.addEventListener("click", async () => {
      try {
        if (renderer.xr.getSession()) { renderer.xr.getSession().end(); return; }
        const s = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
        s.addEventListener("end", () => { vb.textContent = "Enter VR"; dolly.position.y = 0; xrScreen(false); applyExposure(); });
        await renderer.xr.setSession(s);
        dolly.position.y = Math.max(0, rigY - 1.6);
        vb.textContent = "Exit VR";
        xrScreen(true);
        applyExposure();
      } catch {}
    });
  }).catch(() => {});

  /* ── the animated frame-tone ── */
  const tone = {
    current: new THREE.Color(0x8fa8c8),
    target: new THREE.Color(0x8fa8c8),
    tones: [new THREE.Color(0x8fa8c8), new THREE.Color(0xb08a5e), new THREE.Color(0x6e8fb0)],
    lum: 0.45, k: 0, lastFlip: 0, flicker: 1, loadedFor: ""
  };
  async function refreshTones() {
    const info = bridge.getInfo();
    const key = info.frame || info.title;
    if (!key || key === tone.loadedFor) return;
    tone.loadedFor = key;
    if (!info.frame) return;
    try {
      const got = await extractTones(info.frame);
      if (key !== tone.loadedFor) return;      // a flip beat us to it
      tone.tones = got.tones;
      tone.lum = got.lum;
      tone.k = 0;
      tone.target.copy(got.tones[0]);
    } catch {}
  }
  function tickTone(t, dt) {
    if (t - tone.lastFlip > 5.5) {             // drift between the film's tones
      tone.lastFlip = t;
      tone.k = (tone.k + 1) % tone.tones.length;
      tone.target.copy(tone.tones[tone.k]);
    }
    tone.current.lerp(tone.target, Math.min(1, dt * 0.7));
    tone.flicker = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(t * 13.7) * Math.sin(t * 5.3));
  }

  /* ── DOM video → world screen, per frame ──
   * When the world screen is behind you or out of frame, the SAME element
   * re-pins as a flat mini-player in the corner (a second copy is
   * impossible — reading the tainted video's pixels is forbidden — but
   * re-aiming the one element is free). The mini fades with inactivity
   * and returns to full presence on any interaction. */
  let domVideo = null, docked = false, lastActivity = performance.now();
  ["pointerdown", "pointermove", "wheel", "touchstart", "keydown"].forEach((ev) =>
    document.addEventListener(ev, () => { lastActivity = performance.now(); }, { passive: true }));
  function clearDom(v) {
    if (!v) return;
    v.style.transform = "";
    v.style.transformOrigin = "";
    v.style.visibility = "";
    v.style.objectFit = "";
    v.style.opacity = "";
    v.style.borderRadius = "";
    v.style.transition = "";
  }
  function sourceCrop(v) {
    // central 16:9 crop of the element (object-fit:fill inline), so the
    // picture cover-fits its target and spill hides under the canvas
    const W = v.offsetWidth || innerWidth, H = v.offsetHeight || innerHeight;
    let sx = 0, sy = 0, sw = W, sh = H;
    if (v.videoWidth) {
      const va = v.videoWidth / v.videoHeight, qa = 16 / 9;
      if (va > qa) { sw = W * qa / va; sx = (W - sw) / 2; }
      else if (va < qa) { sh = H * va / qa; sy = (H - sh) / 2; }
    }
    return [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]];
  }
  function pinTo(v, dst) {
    const m = homography(sourceCrop(v), dst);
    v.style.transformOrigin = "0 0";
    v.style.objectFit = "fill";
    v.style.transform =
      `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`;
    v.style.visibility = "visible";
  }
  function dockMini(v) {
    // corner mini-player: bottom-right, above the venue chips
    const mw = Math.min(innerWidth * 0.32, 340), mh = mw * 9 / 16;
    const x1 = innerWidth - mw - 14, y1 = innerHeight - mh - 92;
    pinTo(v, [[x1, y1], [x1 + mw, y1], [x1, y1 + mh], [x1 + mw, y1 + mh]]);
    const idle = performance.now() - lastActivity > 4000;
    v.style.transition = "opacity .45s ease";
    v.style.opacity = idle ? "0.25" : "0.95";
    v.style.borderRadius = "10px";
    docked = true;
  }
  function syncDomScreen() {
    const v = bridge.getVideo();
    if (domVideo && domVideo !== v) clearDom(domVideo);
    domVideo = v;
    if (renderer.xr.isPresenting || !world?.screen) { v.style.visibility = "hidden"; return; }
    const hole = world.screen.userData.hole;
    const [w, h] = world.screen.userData.size;
    hole.updateWorldMatrix(true, false);
    const corners = [[-w / 2, h / 2], [w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]];
    const dst = [];
    let offscreen = false;
    for (const [cx, cy] of corners) {
      const p = new THREE.Vector4(cx, cy, 0, 1)
        .applyMatrix4(hole.matrixWorld)
        .applyMatrix4(camera.matrixWorldInverse)
        .applyMatrix4(camera.projectionMatrix);
      if (p.w <= 0.001) { offscreen = true; break; }   // behind us
      dst.push([(p.x / p.w * 0.5 + 0.5) * innerWidth, (-p.y / p.w * 0.5 + 0.5) * innerHeight]);
    }
    if (!offscreen) {
      // …or merely out of frame: no part of the quad's bbox in view
      const xs = dst.map((d) => d[0]), ys = dst.map((d) => d[1]);
      offscreen = Math.max(...xs) < 0 || Math.min(...xs) > innerWidth ||
        Math.max(...ys) < 0 || Math.min(...ys) > innerHeight;
    }
    if (offscreen) { dockMini(v); return; }
    if (docked) { docked = false; v.style.opacity = ""; v.style.borderRadius = ""; v.style.transition = ""; }
    pinTo(v, dst);
  }

  /* XR: swap the punch for a tone-wash (or a real texture when CORS-clean) */
  let xrMat = null;
  function videoIsClean(v) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const x = c.getContext("2d");
      x.drawImage(v, 0, 0, 2, 2);
      x.getImageData(0, 0, 1, 1);
      return true;
    } catch { return false; }
  }
  function xrScreen(on, washOnly = false) {
    const hole = world?.screen?.userData.hole;
    if (!hole) return;
    if (!on) {
      hole.material = hole.userData.punchMat || punchMaterial();
      if (xrMat) { xrMat.map?.dispose?.(); xrMat.dispose?.(); xrMat = null; }
      return;
    }
    const v = bridge.getVideo();
    // note: the clean-probe can pass on the SW-laundered opening seconds
    // and the stream can still taint later — the render loop catches that
    // and re-enters here with washOnly
    if (!washOnly && v.videoWidth && videoIsClean(v)) {
      const tex = new THREE.VideoTexture(v);
      tex.colorSpace = THREE.SRGBColorSpace;
      xrMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    } else {
      xrMat = new THREE.ShaderMaterial({
        uniforms: { c1: { value: tone.tones[0] }, c2: { value: tone.tones[1] }, t: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `
          varying vec2 vUv; uniform vec3 c1, c2; uniform float t;
          void main(){
            float g = vUv.y + .18*sin(vUv.x*3.1+t*.4);
            vec3 col = mix(c1, c2, g) * (.55 + .1*sin(t*1.1));
            float vig = smoothstep(1.05, .45, distance(vUv, vec2(.5)));
            gl_FragColor = vec4(col * vig, 1.);
          }`
      });
    }
    hole.material = xrMat;
  }

  /* ── venue lifecycle ── */
  let world = null, scene = null, rigY = 1.6, currentDef = null;
  function applyExposure() {
    // headsets meter their own light; the flat screen gets each venue's ask
    renderer.toneMappingExposure = renderer.xr.isPresenting ? 1.28 : (currentDef?.exposure ?? 1.28);
  }
  function setScene(id) {
    const def = SCENE_DEFS.find((d) => d.id === id) || SCENE_DEFS[0];
    currentDef = def;
    if (scene) scene.clear();
    scene = new THREE.Scene();
    world = def.build(ctx, scene);
    // opaque sky dome: with an alpha canvas, ANY uncovered pixel would let
    // the page bleed through — the punch hole must be the only transparency
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(190, 24, 16),
      new THREE.MeshBasicMaterial({ color: def.sky ?? 0x05060d, side: THREE.BackSide, fog: false })
    );
    scene.add(dome);
    scene.add(world.group);
    scene.add(dolly);
    const p = world.rig.pos;
    dolly.position.set(p[0], 0, p[2]);
    rigY = p[1];
    camera.position.set(0, rigY, 0);
    yaw = world.rig.yaw || 0; pitch = world.rig.pitch || 0; dist = 0;
    if (world.screenLight) world.screenLight.userData.base = world.screenLight.intensity;
    if (renderer.xr.isPresenting) xrScreen(true);
    applyExposure();
    ui.querySelectorAll(".vp-dot").forEach((c) =>
      c.classList.toggle("on", c.dataset.id === def.id));
    const lbl = ui.querySelector("#vp-label");
    ui.querySelector("#vp-emoji").textContent = def.emoji;
    ui.querySelector("#vp-name").textContent = def.name;
    lbl.classList.remove("vp-anim");
    void lbl.offsetWidth;                        // restart the slide/fade
    lbl.classList.add("vp-anim");
    try { localStorage.setItem("tvp.venue", JSON.stringify(def.id)); } catch {}
  }
  function stepScene(d) {
    const i = SCENE_DEFS.findIndex((x) => x === currentDef);
    setScene(SCENE_DEFS[((i + d) % SCENE_DEFS.length + SCENE_DEFS.length) % SCENE_DEFS.length].id);
  }

  const bug = ui.querySelector("#venue-bug");
  let bugAt = 0;
  function refreshBug(now) {
    if (now - bugAt < 1000) return;
    bugAt = now;
    const i = bridge.getInfo();
    bug.textContent = `${String(i.num).padStart(2, "0")} ${i.channel} — ${i.title}${i.year ? " (" + i.year + ")" : ""}`;
    refreshTones();
  }

  function onKey(e) {
    if (e.key === "x" || (e.key === "Escape" && document.querySelector("#guide:not(.hidden), #search-sheet:not(.hidden)") === null)) {
      exit();
    }
  }
  document.addEventListener("keydown", onKey);
  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener("resize", onResize);

  /* ── frame loop ── */
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    const t = clock.elapsedTime;
    tickTone(t, dt);
    if (!renderer.xr.isPresenting) {
      const sway = Math.sin(t * 0.23) * 0.012;
      camera.rotation.set(pitch + sway * 0.4, 0, 0);
      dolly.rotation.y = yaw + sway;
      camera.position.set(0, rigY, dist);
    }
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();   // no one-frame lag on the pinned video
    // frame-tone drives the world: screen glow light, air volumes, rim
    const c = tone.current, f = tone.flicker, energy = 0.45 + tone.lum * 0.9;
    if (world.screenLight) {
      world.screenLight.color.copy(c);
      world.screenLight.intensity = (world.screenLight.userData.base || 20) * energy * f;
    }
    world.volumes?.forEach(({ mat, mesh }) => {
      mat.uniforms.c.value.copy(c);
      mat.uniforms.t.value = t;
      mat.uniforms.k.value = (mesh.userData.k ?? 0.08) * energy * f;
    });
    const rim = world.screen?.userData.rim;
    if (rim) { rim.material.color.copy(c); rim.material.opacity = 0.06 + tone.lum * 0.08; }
    if (xrMat?.uniforms) {
      xrMat.uniforms.c1.value = tone.tones[0];
      xrMat.uniforms.c2.value = tone.tones[1 % tone.tones.length];
      xrMat.uniforms.t.value = t;
    }
    world.update?.(t, tone);
    // outside a headset the hole must ALWAYS be the punch — if an XR
    // session ended abnormally and left the tone-wash behind, heal it
    const hole = world.screen?.userData.hole;
    if (hole && !renderer.xr.isPresenting && hole.material !== hole.userData.punchMat) {
      hole.material = hole.userData.punchMat;
      if (xrMat) { xrMat.map?.dispose?.(); xrMat.dispose?.(); xrMat = null; }
    }
    syncDomScreen();
    ui.querySelector("#venue-pick").classList.toggle("min", performance.now() - lastActivity > 5000);
    refreshBug(performance.now());
    try {
      renderer.render(scene, camera);
    } catch (err) {
      // a video texture whose stream tainted mid-play (opaque datanode
      // bytes arriving after the clean SW-served prefix) throws here —
      // drop the VR screen to the tone-wash and carry on
      if (xrMat?.map) { try { xrMat.map.dispose(); } catch {} xrScreen(true, true); }
      else throw err;
    }
  });

  let exited = false;
  function exit() {
    if (exited) return;
    exited = true;
    renderer.xr.getSession()?.end().catch?.(() => {});
    renderer.setAnimationLoop(null);
    document.removeEventListener("keydown", onKey);
    removeEventListener("resize", onResize);
    clearDom(domVideo);
    clearDom(bridge.getVideo());
    renderer.dispose();
    mount.remove();
    document.body.classList.remove("in-venue");
    bridge.onExit?.();
  }

  setScene(startId || "starlite");
  return { exit, setScene };

  /* ── texture helpers (canvas-drawn, always same-origin) ── */
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function stars(n, radius, size, color = 0xffffff) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = radius * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(radius * Math.cos(ph)) * 0.9 + 2;
      pos[i * 3 + 2] = radius * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      color, size, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false
    }));
  }
  function motes(n, box, size, color) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box[0];
      pos[i * 3 + 1] = Math.random() * box[1];
      pos[i * 3 + 2] = (Math.random() - 0.5) * box[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 0.6, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    p.userData.box = box;
    return p;
  }
}

/* ════════════════════ the five venues ════════════════════ */

/* 🚗 Starlite Drive-In */
SCENE_DEFS.push({
  id: "starlite", name: "Starlite Drive-In", emoji: "🚗", sky: 0x05060d, exposure: 1.62,
  build({ THREE, canvasTex, stars, screenAssembly, beamFrustum }, scene) {
    const g = new THREE.Group();
    scene.fog = new THREE.Fog(0x05060d, 30, 160);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 40),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);

    const screen = screenAssembly(18, 0xf2ede2, 0.5);
    screen.position.set(0, 7.2, -26);
    g.add(screen);
    [-8, 8].forEach((x) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, 7, 10),
        new THREE.MeshStandardMaterial({ color: 0x3a3f45 })
      );
      pole.position.set(x, 3.5, -26);
      g.add(pole);
    });

    // the projection hut, and its long beam through the night air
    const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3),
      new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.9 }));
    hut.position.set(0, 1.3, 10);
    g.add(hut);
    const beam = beamFrustum(0.5, 0.32, 18, 18 * 9 / 16, 35.8, 0.10);
    beam.mesh.position.set(0, 2.75, 9.5);          // the hut's lens port
    beam.mesh.lookAt(0, 7.2, -25.7);               // …lands exactly on the screen
    g.add(beam.mesh);

    // parked silhouettes — glass raked to bounce the screen light back at us
    const tails = [];
    const carBody = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.35, metalness: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.12, metalness: 0.9 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      if (r === 1 && c === 2) continue;
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 5), carBody);
      body.position.y = 0.55;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 2.1, 12, 1, false, 0, Math.PI), carBody);
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 0.92;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.85), glassMat);
      glass.position.set(0, 1.25, -1.55);
      glass.rotation.x = -0.42;
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.12, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xd42a1e })
      );
      tail.position.set(0, 0.62, 2.52);
      tails.push(tail.material);
      car.add(body, roof, glass, tail);
      car.position.set((c - 2) * 5.4 + (r % 2 ? 1.4 : 0), 0, -4 - r * 7 + (Math.sin(c * 9 + r) * 0.5));
      car.rotation.y = (Math.random() - 0.5) * 0.12;
      g.add(car);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
        new THREE.MeshStandardMaterial({ color: 0x555b63 }));
      post.position.set(car.position.x - 1.7, 0.55, car.position.z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x777f88, roughness: 0.4, metalness: 0.6 }));
      box.position.set(post.position.x, 1.15, post.position.z);
      g.add(post, box);
    }

    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 3.4),
      new THREE.MeshBasicMaterial({
        map: canvasTex(512, 256, (x, w, h) => {
          x.fillStyle = "#0a0c14"; x.fillRect(0, 0, w, h);
          x.strokeStyle = "#ffd75e"; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28);
          x.fillStyle = "#ff9dbb"; x.font = "bold 92px Trebuchet MS, sans-serif";
          x.textAlign = "center"; x.fillText("STARLITE", w / 2, 118);
          x.fillStyle = "#9fd8ff"; x.font = "42px Trebuchet MS, sans-serif";
          x.fillText("DRIVE-IN  ·  OPEN ALL NIGHT", w / 2, 190);
          x.fillStyle = "#ffd75e";
          for (let i = 0; i < 22; i++) { x.beginPath(); x.arc(30 + i * ((w - 60) / 21), 30, 6, 0, 7); x.fill(); }
        }), transparent: true
      })
    );
    marquee.position.set(21, 4.6, -12);
    marquee.rotation.y = -0.6;
    g.add(marquee);
    const marqueeGlow = new THREE.PointLight(0xff9dbb, 14, 26, 1.8);
    marqueeGlow.position.set(20, 4.6, -11);
    g.add(marqueeGlow);

    const moon = new THREE.Mesh(new THREE.CircleGeometry(4, 24),
      new THREE.MeshBasicMaterial({
        map: canvasTex(128, 128, (x, w, h) => {
          const r = x.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
          r.addColorStop(0, "#fdf8e7"); r.addColorStop(0.75, "#e8e0c5"); r.addColorStop(1, "rgba(232,224,197,0)");
          x.fillStyle = r; x.fillRect(0, 0, w, h);
        }), transparent: true, depthWrite: false
      }));
    moon.position.set(-34, 34, -80);
    g.add(moon);
    g.add(stars(900, 150, 0.42));

    g.add(new THREE.AmbientLight(0x3a4058, 1.25));
    const screenLight = new THREE.PointLight(0xbfd4ff, 34, 55, 1.6);
    screenLight.position.set(0, 6.5, -22);
    g.add(screenLight);

    return {
      group: g, screen, screenLight, volumes: [beam],
      rig: { pos: [0, 1.35, -11], yaw: 0 },
      update(t) {
        marqueeGlow.intensity = 12 + Math.sin(t * 17) * 1.6 + Math.sin(t * 3.1) * 1.2;
        tails.forEach((m, i) => { m.color.setScalar(0); m.color.r = 0.55 + 0.45 * (Math.sin(t * 0.7 + i * 2.4) > 0.92 ? 1 : 0.35); });
      }
    };
  }
});

/* 🪐 Neon Orbit Lounge */
SCENE_DEFS.push({
  id: "neon", name: "Neon Orbit Lounge", emoji: "🪐", sky: 0x070312,
  build({ THREE, canvasTex, stars, screenAssembly, beamFrustum }, scene) {
    const g = new THREE.Group();
    scene.fog = new THREE.Fog(0x070312, 26, 90);

    const gridMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } },
      transparent: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float t;
        void main(){
          vec2 p = vUv * vec2(46., 60.); p.y += t*1.4;
          vec2 f = abs(fract(p)-.5);
          float line = smoothstep(.46,.5,max(f.x,f.y));
          float fade = smoothstep(1., .25, vUv.y);
          vec3 col = mix(vec3(.04,.01,.09), vec3(.98,.18,.62), line*.9);
          col += vec3(.1,.6,.9)*line*.35*sin(t*.7+vUv.y*9.);
          gl_FragColor = vec4(col, .92*fade + .35);
        }`
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), gridMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.z = -40;
    g.add(grid);

    const sun = new THREE.Mesh(new THREE.CircleGeometry(13, 48),
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 256, (x, w, h) => {
          const gr = x.createLinearGradient(0, 0, 0, h);
          gr.addColorStop(0, "#ffd95e"); gr.addColorStop(0.55, "#ff5e8a"); gr.addColorStop(1, "#b13cff");
          x.fillStyle = gr; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, 7); x.fill();
          x.globalCompositeOperation = "destination-out";
          for (let i = 0; i < 6; i++) x.fillRect(0, h * 0.55 + i * 16, w, 5 + i * 1.6);
        }), transparent: true, depthWrite: false
      }));
    sun.position.set(0, 10, -95);
    g.add(sun);

    const planet = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 24),
      new THREE.MeshStandardMaterial({
        map: canvasTex(256, 128, (x, w, h) => {
          const bands = ["#3b2b63", "#5a3d8f", "#7752b8", "#4a3178", "#69479f"];
          for (let i = 0; i < h; i += 8) { x.fillStyle = bands[(i / 8) % 5 | 0]; x.fillRect(0, i, w, 8); }
        }), roughness: 0.9, emissive: 0x221144, emissiveIntensity: 0.5
      }));
    planet.position.set(-30, 26, -70);
    const ring = new THREE.Mesh(new THREE.RingGeometry(8, 12.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    ring.position.copy(planet.position);
    ring.rotation.x = 1.15; ring.rotation.y = 0.3;
    g.add(planet, ring);
    g.add(stars(1200, 140, 0.4, 0xcfe6ff));

    const screen = screenAssembly(10.5, 0x0b0618, 0.1);
    screen.position.set(0, 4.6, -14);
    screen.rotation.x = -0.04;
    g.add(screen);
    [[-5.45, 0], [5.45, 0]].forEach(([x], i) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.4, 10),
        new THREE.MeshBasicMaterial({ color: i ? 0x22e6ff : 0xff2fa0 }));
      tube.position.set(x, 4.6, -13.9);
      g.add(tube);
    });
    // the hologram sheds light into the room
    const holoGlow = beamFrustum(10.5, 10.5 * 9 / 16, 13.5, 8.5, 9.5, 0.08);
    holoGlow.mesh.position.set(0, 4.55, -13.9);    // from the hologram's face…
    holoGlow.mesh.lookAt(0, 1.6, -3.5);            // …spilling down toward the bar
    g.add(holoGlow.mesh);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(9, 1.15, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x140a26, roughness: 0.18, metalness: 0.75 }));
    bar.position.set(0, 0.58, -5.5);
    const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(9.06, 0.08, 1.66),
      new THREE.MeshBasicMaterial({ color: 0x22e6ff }));
    glowStrip.position.set(0, 0.12, -5.5);
    g.add(bar, glowStrip);
    for (let i = -2; i <= 2; i++) {
      const stool = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 16),
        new THREE.MeshStandardMaterial({ color: 0xff2fa0, roughness: 0.4, emissive: 0x550a33, emissiveIntensity: 0.6 }));
      seat.position.y = 0.82;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.82, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a3f55, metalness: 0.8, roughness: 0.3 }));
      leg.position.y = 0.41;
      stool.add(seat, leg);
      stool.position.set(i * 1.7, 0, -3.9);
      g.add(stool);
    }

    const rails = [];
    for (let i = 0; i < 5; i++) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 22, 8),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2fa0 : 0x22e6ff, transparent: true }));
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, 7.5, -2 - i * 3.4);
      rails.push(rail.material);
      g.add(rail);
    }

    g.add(new THREE.AmbientLight(0x32265a, 1.3));
    const pink = new THREE.PointLight(0xff2fa0, 20, 30, 1.8); pink.position.set(-6, 5, -8);
    const cyan = new THREE.PointLight(0x22e6ff, 20, 30, 1.8); cyan.position.set(6, 5, -8);
    const screenLight = new THREE.PointLight(0x8fa8c8, 30, 30, 1.7);
    screenLight.position.set(0, 4.4, -12.5);
    g.add(pink, cyan, screenLight);

    return {
      group: g, screen, screenLight, volumes: [holoGlow],
      rig: { pos: [0, 1.5, -1.5], yaw: 0 },
      update(t) {
        gridMat.uniforms.t.value = t;
        rails.forEach((m, i) => { m.opacity = 0.75 + 0.25 * Math.sin(t * 2.2 + i * 1.7); });
        ring.rotation.z = t * 0.03;
      }
    };
  }
});

/* 🎭 The Bijou */
SCENE_DEFS.push({
  id: "bijou", name: "The Bijou", emoji: "🎭", sky: 0x0c0705, exposure: 1.55,
  build({ THREE, motes, screenAssembly, beamFrustum }, scene) {
    const g = new THREE.Group();
    scene.fog = new THREE.Fog(0x0c0705, 18, 60);

    const gold = new THREE.MeshStandardMaterial({ color: 0xb98a2e, roughness: 0.22, metalness: 0.85, emissive: 0x4a3410, emissiveIntensity: 0.3 });
    const velvet = new THREE.MeshStandardMaterial({ color: 0x7c1220, roughness: 0.95 });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 34),
      new THREE.MeshStandardMaterial({ color: 0x2a0e12, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -8;
    g.add(floor);

    [[-8.2, 0], [8.2, 0]].forEach(([x]) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 11, 14), gold);
      col.position.set(x, 5.5, -20);
      g.add(col);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(18.6, 1.6, 1.6), gold);
    lintel.position.set(0, 11.2, -20);
    g.add(lintel);
    const archTop = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.55, 10, 40, Math.PI), gold);
    archTop.position.set(0, 11.2, -20);
    g.add(archTop);

    const screen = screenAssembly(13, 0x070403, 0.2);
    screen.position.set(0, 5.6, -19.4);
    g.add(screen);

    // curtains drawn OPEN: inner edges must clear the 13-wide screen
    // (±6.5) or the velvet eats the edges of the picture
    [-1, 1].forEach((side) => {
      const geo = new THREE.PlaneGeometry(3.4, 10.4, 34, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.sin(pos.getX(i) * 4.2) * 0.32);
      }
      geo.computeVertexNormals();
      const cur = new THREE.Mesh(geo, velvet);
      cur.position.set(side * 8.6, 5.6, -18.9);
      g.add(cur);
      const swag = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.2, 10, 1, false), velvet);
      swag.rotation.z = Math.PI / 2 + side * 0.22;
      swag.position.set(side * 7.9, 10.4, -18.8);
      g.add(swag);
    });

    const seatGeo = new THREE.BoxGeometry(0.86, 0.9, 0.8);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a0d16, roughness: 0.7, metalness: 0.15 });
    const rows = 6, cols = 12;
    const seats = new THREE.InstancedMesh(seatGeo, seatMat, rows * cols);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * 1.06 + (c >= cols / 2 ? 0.9 : -0.9);
      m4.setPosition(x, 0.45 + r * 0.16, -14.5 + r * 1.7);
      seats.setMatrixAt(k++, m4);
    }
    g.add(seats);

    for (let i = 0; i < 4; i++) {
      [-1, 1].forEach((side) => {
        const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xffc879 }));
        sconce.position.set(side * 11.5, 4.4, -16 + i * 4.4);
        g.add(sconce);
      });
    }
    const warmL = new THREE.PointLight(0xffb45e, 18, 30, 1.9); warmL.position.set(-9, 6, -10);
    const warmR = new THREE.PointLight(0xffb45e, 18, 30, 1.9); warmR.position.set(9, 6, -10);
    g.add(warmL, warmR, new THREE.AmbientLight(0x4a3022, 1.2));

    // the projector's beam, and the screen's own glow washing the gold
    const booth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x1c120e, roughness: 0.9 }));
    booth.position.set(0, 7.4, 3.2);
    g.add(booth);
    const beam = beamFrustum(0.42, 0.28, 13, 13 * 9 / 16, 22, 0.12);
    beam.mesh.position.set(0, 7.35, 2.7);          // the booth's porthole
    beam.mesh.lookAt(0, 5.6, -19.3);               // …edges land on the screen's
    g.add(beam.mesh);
    const screenLight = new THREE.PointLight(0xbfd4ff, 36, 40, 1.6);
    screenLight.position.set(0, 5.4, -16.5);
    g.add(screenLight);

    const dust = motes(160, [7, 6, 20], 0.05, 0xcfd8ff);
    dust.position.set(0, 4.5, -10);
    g.add(dust);

    return {
      group: g, screen, screenLight, volumes: [beam],
      rig: { pos: [0, 1.55, -4.5], yaw: 0 },
      update(t) {
        dust.position.y = 4.5 + Math.sin(t * 0.12) * 0.25;
        dust.rotation.y = t * 0.008;
      }
    };
  }
});

/* 💎 Grotto Lumina */
SCENE_DEFS.push({
  id: "grotto", name: "Grotto Lumina", emoji: "💎", sky: 0x02070a,
  build({ THREE, motes, screenAssembly, beamFrustum }, scene) {
    const g = new THREE.Group();
    scene.fog = new THREE.Fog(0x02070a, 12, 55);

    const shellGeo = new THREE.IcosahedronGeometry(24, 3);
    const sp = shellGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(sp, i);
      const n = 1 + 0.16 * Math.sin(v.x * 0.7) * Math.sin(v.y * 1.1 + 2) * Math.sin(v.z * 0.9 + 4)
        + 0.07 * Math.sin(v.x * 2.3 + v.z * 1.7);
      v.multiplyScalar(n);
      sp.setXYZ(i, v.x, Math.max(v.y, -2.2), v.z);
    }
    shellGeo.computeVertexNormals();
    const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({
      color: 0x1a2430, roughness: 0.85, metalness: 0.08, side: THREE.BackSide, flatShading: true
    }));
    shell.position.y = 6;
    g.add(shell);

    // crystal water — sparkle tinted by the frame tone
    const waterMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, tint: { value: new THREE.Color(0x59e8ff) } },
      transparent: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float t; uniform vec3 tint;
        void main(){
          vec2 p = vUv*22.;
          float w = sin(p.x+t*.8)*sin(p.y*1.3-t*.6) + sin((p.x+p.y)*.7+t*1.1)*.5;
          float sparkle = smoothstep(.9,1.,sin(p.x*3.1+t*2.)*sin(p.y*2.7-t*1.7));
          vec3 col = mix(vec3(.01,.09,.13), vec3(.05,.35,.42), .5+.5*w);
          col += tint*sparkle*.75;
          // a soft lane of screen-light lying on the water
          float lane = smoothstep(.35,.0,abs(vUv.x-.5)) * smoothstep(.1,.55,vUv.y);
          col += tint * lane * .22 * (0.75+0.25*sin(t*1.3+vUv.y*14.));
          float edge = smoothstep(.5,.15,distance(vUv,vec2(.5)));
          gl_FragColor = vec4(col, .88*edge);
        }`
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(15, 48), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, -6);
    g.add(water);

    const screen = screenAssembly(9, 0x0c141c, 0.3);
    screen.position.set(0, 4.3, -16.5);
    g.add(screen);
    // screen-glow rolling across the water toward us
    const wash = beamFrustum(9, 9 * 9 / 16, 11.5, 7, 13, 0.07);
    wash.mesh.position.set(0, 4.2, -16.2);         // from the screen's face…
    wash.mesh.lookAt(0, 0.6, -2.5);                // …laying light over the water
    g.add(wash.mesh);

    const crysMat = (c) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.12, metalness: 0.15, emissive: c, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.88, flatShading: true
    });
    const palette = [0x59e8ff, 0x9f7bff, 0x64ffd0];
    const clusters = [[-9, 0, -12], [9.5, 0, -11], [-5, 0, -16], [6, 0, -17], [-11, 0, -4], [11, 0, -3]];
    clusters.forEach(([cx, cy, cz], ci) => {
      for (let i = 0; i < 4; i++) {
        const h = 1.2 + Math.random() * 2.8;
        const cr = new THREE.Mesh(new THREE.ConeGeometry(0.34 + Math.random() * 0.3, h, 5),
          crysMat(palette[(ci + i) % 3]));
        cr.position.set(cx + (Math.random() - 0.5) * 1.6, cy + h / 2 - 0.1, cz + (Math.random() - 0.5) * 1.6);
        cr.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
        g.add(cr);
      }
    });

    const glow = motes(140, [26, 9, 24], 0.07, 0x9fffe8);
    glow.position.set(0, 1, -8);
    g.add(glow);

    g.add(new THREE.AmbientLight(0x1a3c48, 1.4));
    const cyan = new THREE.PointLight(0x59e8ff, 24, 26, 1.8); cyan.position.set(-8, 3.5, -10);
    const violet = new THREE.PointLight(0x9f7bff, 20, 26, 1.8); violet.position.set(8, 3.5, -9);
    const screenLight = new THREE.PointLight(0x8fd8ff, 34, 32, 1.6);
    screenLight.position.set(0, 4, -14.5);
    g.add(cyan, violet, screenLight);

    return {
      group: g, screen, screenLight, volumes: [wash],
      rig: { pos: [0, 1.5, 3.5], yaw: 0 },
      update(t, tone) {
        waterMat.uniforms.t.value = t;
        waterMat.uniforms.tint.value.copy(tone.current);
        glow.rotation.y = t * 0.02;
        glow.position.y = 1 + Math.sin(t * 0.3) * 0.3;
        cyan.intensity = 22 + Math.sin(t * 1.3) * 4;
        violet.intensity = 18 + Math.sin(t * 1.7 + 2) * 4;
      }
    };
  }
});

/* 📼 Rec Room ’07 */
SCENE_DEFS.push({
  id: "rec07", name: "Rec Room ’07", emoji: "📼", sky: 0x0b0908,
  build({ THREE, canvasTex, screenAssembly, beamFrustum }, scene) {
    const g = new THREE.Group();
    scene.fog = new THREE.Fog(0x0b0908, 12, 40);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x40372c, roughness: 0.95, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(14, 6.4, 16), wallMat);
    room.position.set(0, 3.2, -4);
    g.add(room);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.6, 30),
      new THREE.MeshStandardMaterial({ color: 0x6e2f1c, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, -5);
    g.add(rug);

    const crt = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.15, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.35, metalness: 0.2 }));
    const screen = screenAssembly(3.6, 0x191917, 0.06);
    screen.position.set(0, 0.06, 1.32);
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6 * 9 / 16),
      new THREE.MeshBasicMaterial({
        map: canvasTex(8, 256, (x, w, h) => {
          x.clearRect(0, 0, w, h);
          x.fillStyle = "rgba(0,0,0,.55)";
          for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1.6);
        }), transparent: true, opacity: 0.22, depthWrite: false
      }));
    scan.position.set(0, 0.06, 1.42);
    crt.add(shell, screen, scan);
    crt.position.set(0, 2.15, -9.6);
    g.add(crt);
    // note: `screen` sits inside crt — flag world-space parent for the punch
    // (the shared code uses matrixWorld, so nesting is fine)

    // the tube's glow spilling into the room
    const tvGlow = beamFrustum(3.6, 3.6 * 9 / 16, 5.6, 3.6, 6.8, 0.10);
    tvGlow.mesh.position.set(0, 2.21, -8.2);       // from the tube's face…
    tvGlow.mesh.lookAt(0, 1.1, -1.4);              // …washing over couch and rug
    g.add(tvGlow.mesh);

    const stand = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.45, metalness: 0.1 }));
    stand.position.set(0, 0.55, -9.6);
    g.add(stand);
    const vhs = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x171512, roughness: 0.4, metalness: 0.3 }));
    vhs.position.set(-1.2, 1.3, -9.4);
    const clockTex = canvasTex(128, 32, (x, w, h) => {
      x.fillStyle = "#020403"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#37ff8a"; x.font = "bold 24px monospace"; x.fillText("12:00", 28, 24);
    });
    const vhsClock = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2),
      new THREE.MeshBasicMaterial({ map: clockTex, transparent: true }));
    vhsClock.position.set(-1.2, 1.32, -8.68);
    g.add(vhs, vhsClock);

    const couchMat = new THREE.MeshStandardMaterial({ color: 0x35452e, roughness: 0.95 });
    const couch = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.85, 1.9), couchMat); base.position.y = 0.65;
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.2, 0.5), couchMat); back.position.set(0, 1.45, 0.7);
    [[-2.15], [2.15]].forEach(([x]) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 1.9), couchMat);
      arm.position.set(x, 1.25, 0);
      couch.add(arm);
    });
    couch.add(base, back);
    couch.position.set(0, 0, -1.6);
    couch.rotation.y = Math.PI;
    g.add(couch);
    // glossy coffee table — it catches the tube light
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.15, metalness: 0.25 }));
    table.position.set(0, 0.25, -5);
    g.add(table);

    const lamp = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.15, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xff7b2d, transparent: true, opacity: 0.28, roughness: 0.2 }));
    glass.position.y = 0.85;
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.32, 12),
      new THREE.MeshStandardMaterial({ color: 0x777f88, metalness: 0.8, roughness: 0.3 }));
    lampBase.position.y = 0.16;
    const blobs = [];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff9b3d }));
      b.position.y = 0.5;
      blobs.push(b);
      lamp.add(b);
    }
    lamp.add(glass, lampBase);
    lamp.position.set(2.6, 1.1, -9.2);
    g.add(lamp);
    const lavaGlow = new THREE.PointLight(0xff8b3d, 8, 8, 1.9);
    lavaGlow.position.set(2.6, 1.9, -9.2);
    g.add(lavaGlow);

    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.7),
      new THREE.MeshBasicMaterial({
        map: canvasTex(512, 320, (x, w, h) => {
          const grad = x.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, "#0a1230"); grad.addColorStop(1, "#1b2547");
          x.fillStyle = grad; x.fillRect(0, 0, w, h);
          x.fillStyle = "#fdf8e7"; x.beginPath(); x.arc(430, 60, 22, 0, 7); x.fill();
          for (let i = 0; i < 9; i++) {
            const bw = 30 + (i * 37) % 40, bh = 90 + (i * 53) % 130, bx = 12 + i * 55;
            x.fillStyle = "#060a18"; x.fillRect(bx, h - bh, bw, bh);
            x.fillStyle = "#ffd75e";
            for (let wy = h - bh + 8; wy < h - 10; wy += 16)
              for (let wx = bx + 5; wx < bx + bw - 6; wx += 12)
                if ((wx * wy) % 7 > 2.8) x.fillRect(wx, wy, 5, 7);
          }
        })
      }));
    win.position.set(-6.96, 3.4, -6);
    win.rotation.y = Math.PI / 2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 4.7),
      new THREE.MeshStandardMaterial({ color: 0x241a12 }));
    frame.position.set(-6.98, 3.4, -6);
    g.add(win, frame);

    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 2.2),
      new THREE.MeshBasicMaterial({
        map: canvasTex(192, 256, (x, w, h) => {
          x.fillStyle = "#1a1430"; x.fillRect(0, 0, w, h);
          x.strokeStyle = "#c6600c"; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
          x.save(); x.translate(w / 2, h * 0.42);
          for (let i = 0; i < 12; i++) {            // sunburst
            x.fillStyle = i % 2 ? "#2c2350" : "#3a2d68";
            x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 78, i * Math.PI / 6, (i + 1) * Math.PI / 6); x.fill();
          }
          x.restore();
          x.fillStyle = "#ffd75e"; x.font = "bold 26px Trebuchet MS, sans-serif"; x.textAlign = "center";
          x.fillText("MIDNIGHT", w / 2, h * 0.62);
          x.fillText("MATINEE", w / 2, h * 0.74);
          x.fillStyle = "#9fd8ff"; x.font = "13px Trebuchet MS, sans-serif";
          x.fillText("every night · channel 1–18", w / 2, h * 0.86);
        })
      }));
    poster.position.set(6.92, 3.4, -8.5);           // side wall, clear of the TV
    poster.rotation.y = -Math.PI / 2;
    g.add(poster);

    const warm = new THREE.PointLight(0xffc98a, 12, 18, 1.8);
    warm.position.set(-3, 4.4, -3);
    const screenLight = new THREE.PointLight(0xbfd4ff, 16, 14, 1.7);
    screenLight.position.set(0, 2.2, -8.2);
    g.add(warm, screenLight, new THREE.AmbientLight(0x564a40, 1.2));

    return {
      group: g, screen, screenLight, volumes: [tvGlow],
      rig: { pos: [0, 1.35, -2.2], yaw: 0 },
      update(t) {
        blobs.forEach((b, i) => {
          b.position.y = 0.55 + Math.sin(t * 0.5 + i * 2.1) * 0.28;
          const s = 0.8 + Math.sin(t * 0.7 + i * 1.4) * 0.25;
          b.scale.set(s, 1.2 - s * 0.25, s);
        });
        lavaGlow.intensity = 7 + Math.sin(t * 0.9) * 1.5;
        vhsClock.visible = Math.sin(t * 3.14) > -0.2;
      }
    };
  }
});
