/*
 * TVP/2007 — venue mode. 🍿
 *
 * Five little worlds, each with the live channel playing on an in-world
 * screen: a 1950s drive-in, a synthwave space lounge, a gilded picture
 * palace, a crystal grotto, and a 2007 rec room. Everything is generated
 * — geometry, neon, star fields, test cards — no assets are downloaded.
 *
 * Lazy-loaded ES module (three.js is vendored, ~680KB, fetched only when
 * the venue button is first pressed). WebGL2 everywhere; on WebXR-capable
 * browsers an "Enter VR" button drops you inside the venue. The active
 * <video> element keeps playing exactly as in 2D — this module just
 * borrows its pixels as a texture, so tuning, audio, subtitles state and
 * the broadcast clock are untouched. Channel flips (↑/↓, guide) work
 * while you're in the world.
 *
 * Exports launchScenes(bridge) → { exit, setScene }.
 */

import * as THREE from "../vendor/three.module.min.js";

const SCENE_DEFS = [];  // filled at bottom: {id, name, emoji, build}

export function launchScenes(bridge, startId) {
  const mount = document.createElement("div");
  mount.id = "venue";
  document.body.appendChild(mount);
  document.body.classList.add("in-venue");

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  mount.appendChild(renderer.domElement);

  /* ── the shared video screen ── */
  let texVideo = null, videoTex = null;
  const screenMats = [];
  function videoMaterial() {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    screenMats.push(m);
    return m;
  }
  function syncVideoTexture() {
    const v = bridge.getVideo();
    if (v !== texVideo) {
      texVideo = v;
      if (videoTex) videoTex.dispose();
      videoTex = new THREE.VideoTexture(v);
      videoTex.colorSpace = THREE.SRGBColorSpace;
      screenMats.forEach((m) => { m.map = videoTex; m.needsUpdate = true; });
    }
    // cover-crop the texture into the 16:9 screens (no stretched faces)
    if (videoTex && texVideo.videoWidth) {
      const va = texVideo.videoWidth / texVideo.videoHeight, sa = 16 / 9;
      if (va > sa) {
        videoTex.repeat.set(sa / va, 1);
        videoTex.offset.set((1 - sa / va) / 2, 0);
      } else {
        videoTex.repeat.set(1, va / sa);
        videoTex.offset.set(0, (1 - va / sa) / 2);
      }
    }
  }

  /* ── helpers shared by the venue builders ── */
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
  function screenAssembly(w, frameColor = 0x111111, frameDepth = 0.12) {
    // a 16:9 video plane in a slim frame; every venue places one of these
    const h = w * 9 / 16;
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.24, h + 0.24, frameDepth),
      new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.8 })
    );
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), videoMaterial());
    face.position.z = frameDepth / 2 + 0.005;
    grp.add(frame, face);
    grp.userData.size = [w, h];
    return grp;
  }
  const ctx = { THREE, canvasTex, stars, motes, screenAssembly, videoMaterial };

  /* ── camera rig: drag to look, wheel/pinch to move ── */
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

  /* ── DOM overlay: venue chips, channel bug, VR + exit ── */
  const ui = document.createElement("div");
  ui.id = "venue-ui";
  ui.innerHTML = `
    <div id="venue-bug"></div>
    <button id="venue-exit" title="Back to 2D (x)">✕</button>
    <div id="venue-chips"></div>
    <button id="venue-vr" class="hidden">Enter VR</button>`;
  mount.appendChild(ui);
  const chips = ui.querySelector("#venue-chips");
  SCENE_DEFS.forEach((d) => {
    const b = document.createElement("button");
    b.className = "venue-chip";
    b.dataset.id = d.id;
    b.innerHTML = `<span>${d.emoji}</span>${d.name}`;
    b.addEventListener("click", () => setScene(d.id));
    chips.appendChild(b);
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
        s.addEventListener("end", () => { vb.textContent = "Enter VR"; dolly.position.y = rigY; });
        await renderer.xr.setSession(s);
        dolly.position.y = Math.max(0, rigY - 1.6);   // headset supplies eye height
        vb.textContent = "Exit VR";
      } catch {}
    });
  }).catch(() => {});

  /* ── venue lifecycle ── */
  let world = null, scene = null, rigY = 1.6;
  function setScene(id) {
    const def = SCENE_DEFS.find((d) => d.id === id) || SCENE_DEFS[0];
    if (world) { scene.clear(); }
    screenMats.length = 0;
    scene = new THREE.Scene();
    world = def.build(ctx, scene);
    scene.add(world.group);
    scene.add(dolly);
    const p = world.rig.pos;
    dolly.position.set(p[0], 0, p[2]);
    rigY = p[1];
    camera.position.set(0, rigY, 0);
    yaw = world.rig.yaw || 0; pitch = world.rig.pitch || 0; dist = 0;
    texVideo = null;                       // force texture re-bind to new mats
    if (videoTex) { videoTex.dispose(); videoTex = null; }
    chips.querySelectorAll(".venue-chip").forEach((c) =>
      c.classList.toggle("on", c.dataset.id === def.id));
    try { localStorage.setItem("tvp.venue", JSON.stringify(def.id)); } catch {}
  }

  /* channel bug text, refreshed gently */
  const bug = ui.querySelector("#venue-bug");
  let bugAt = 0;
  function refreshBug(t) {
    if (t - bugAt < 1000) return;
    bugAt = t;
    const i = bridge.getInfo();
    bug.textContent = `${String(i.num).padStart(2, "0")} ${i.channel} — ${i.title}${i.year ? " (" + i.year + ")" : ""}`;
  }

  /* keys: x always exits; Esc exits when no app overlay is using it */
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
    const t = clock.getElapsedTime();
    syncVideoTexture();
    if (!renderer.xr.isPresenting) {
      const sway = Math.sin(t * 0.23) * 0.012;
      camera.rotation.set(pitch + sway * 0.4, 0, 0);
      dolly.rotation.y = yaw + sway;
      camera.position.set(0, rigY, dist);
    }
    world.update?.(t);
    refreshBug(performance.now());
    renderer.render(scene, camera);
  });

  let exited = false;
  function exit() {
    if (exited) return;
    exited = true;
    renderer.xr.getSession()?.end().catch?.(() => {});
    renderer.setAnimationLoop(null);
    document.removeEventListener("keydown", onKey);
    removeEventListener("resize", onResize);
    if (videoTex) videoTex.dispose();
    renderer.dispose();
    mount.remove();
    document.body.classList.remove("in-venue");
    bridge.onExit?.();
  }

  setScene(startId || "starlite");
  return { exit, setScene };
}

/* ════════════════════ the five venues ════════════════════ */

/* 🚗 Starlite Drive-In — asphalt, big white screen, a sky full of stars */
SCENE_DEFS.push({
  id: "starlite", name: "Starlite Drive-In", emoji: "🚗",
  build({ THREE, canvasTex, stars, screenAssembly }, scene) {
    const g = new THREE.Group();
    scene.fog = new THREE.Fog(0x05060d, 30, 160);
    scene.background = new THREE.Color(0x05060d);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 40),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 1 })
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

    // rows of parked silhouette cars, tail-lights winking
    const tails = [];
    const carBody = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.6, metalness: 0.3 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      if (r === 1 && c === 2) continue;              // our spot
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 5), carBody);
      body.position.y = 0.55;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 2.1, 12, 1, false, 0, Math.PI), carBody);
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 0.92;
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.12, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xd42a1e })
      );
      tail.position.set(0, 0.62, 2.52);
      tails.push(tail.material);
      car.add(body, roof, tail);
      car.position.set((c - 2) * 5.4 + (r % 2 ? 1.4 : 0), 0, -4 - r * 7 + (Math.sin(c * 9 + r) * 0.5));
      car.rotation.y = (Math.random() - 0.5) * 0.12;
      g.add(car);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6),
        new THREE.MeshStandardMaterial({ color: 0x555b63 }));
      post.position.set(car.position.x - 1.7, 0.55, car.position.z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x777f88 }));
      box.position.set(post.position.x, 1.15, post.position.z);
      g.add(post, box);
    }

    // neon marquee off to the side
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

    // moon
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

    g.add(new THREE.AmbientLight(0x33384a, 0.9));
    const screenGlow = new THREE.PointLight(0xbfd4ff, 30, 45, 1.7);
    screenGlow.position.set(0, 6, -20);
    g.add(screenGlow);

    return {
      group: g, rig: { pos: [0, 1.35, -11], yaw: 0 },
      update(t) {
        marqueeGlow.intensity = 12 + Math.sin(t * 17) * 1.6 + Math.sin(t * 3.1) * 1.2;
        tails.forEach((m, i) => { m.color.setScalar(0); m.color.r = 0.55 + 0.45 * (Math.sin(t * 0.7 + i * 2.4) > 0.92 ? 1 : 0.35); });
      }
    };
  }
});

/* 🪐 Neon Orbit Lounge — synthwave grid, planet out the window */
SCENE_DEFS.push({
  id: "neon", name: "Neon Orbit Lounge", emoji: "🪐",
  build({ THREE, canvasTex, stars, screenAssembly }, scene) {
    const g = new THREE.Group();
    scene.background = new THREE.Color(0x070312);
    scene.fog = new THREE.Fog(0x070312, 26, 90);

    // the lounge floor: an animated neon grid shader
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

    // synth sun on the horizon
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

    // ringed planet, hanging in the black
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

    // the floating hologram screen, framed in neon
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

    // bar counter with underglow, a few stools
    const bar = new THREE.Mesh(new THREE.BoxGeometry(9, 1.15, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x140a26, roughness: 0.35, metalness: 0.5 }));
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

    // ceiling neon rails
    const rails = [];
    for (let i = 0; i < 5; i++) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 22, 8),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2fa0 : 0x22e6ff, transparent: true }));
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, 7.5, -2 - i * 3.4);
      rails.push(rail.material);
      g.add(rail);
    }

    g.add(new THREE.AmbientLight(0x2a1f4a, 1.1));
    const pink = new THREE.PointLight(0xff2fa0, 25, 30, 1.8); pink.position.set(-6, 5, -8);
    const cyan = new THREE.PointLight(0x22e6ff, 25, 30, 1.8); cyan.position.set(6, 5, -8);
    g.add(pink, cyan);

    return {
      group: g, rig: { pos: [0, 1.5, -1.5], yaw: 0 },
      update(t) {
        gridMat.uniforms.t.value = t;
        rails.forEach((m, i) => { m.opacity = 0.75 + 0.25 * Math.sin(t * 2.2 + i * 1.7); });
        ring.rotation.z = t * 0.03;
      }
    };
  }
});

/* 🎭 The Bijou — gilt, velvet, and a projector beam full of dust */
SCENE_DEFS.push({
  id: "bijou", name: "The Bijou", emoji: "🎭",
  build({ THREE, canvasTex, motes, screenAssembly }, scene) {
    const g = new THREE.Group();
    scene.background = new THREE.Color(0x0c0705);
    scene.fog = new THREE.Fog(0x0c0705, 18, 60);

    const gold = new THREE.MeshStandardMaterial({ color: 0xb98a2e, roughness: 0.35, metalness: 0.75, emissive: 0x4a3410, emissiveIntensity: 0.35 });
    const velvet = new THREE.MeshStandardMaterial({ color: 0x7c1220, roughness: 0.95 });

    // raked floor and carpet
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 34),
      new THREE.MeshStandardMaterial({ color: 0x2a0e12, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -8;
    g.add(floor);

    // proscenium arch: columns, lintel, screen inside
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

    // folded velvet curtains left and right
    [-1, 1].forEach((side) => {
      const geo = new THREE.PlaneGeometry(4.6, 10.4, 46, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.sin(pos.getX(i) * 4.2) * 0.32);
      }
      geo.computeVertexNormals();
      const cur = new THREE.Mesh(geo, velvet);
      cur.position.set(side * 6.2, 5.6, -18.9);
      g.add(cur);
      const swag = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.8, 10, 1, false), velvet);
      swag.rotation.z = Math.PI / 2 + side * 0.22;
      swag.position.set(side * 6.2, 10.2, -18.8);
      g.add(swag);
    });

    // rows of seats (instanced)
    const seatGeo = new THREE.BoxGeometry(0.86, 0.9, 0.8);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a0d16, roughness: 0.9 });
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

    // wall sconces (fake glow) + two real warm lights
    for (let i = 0; i < 4; i++) {
      [-1, 1].forEach((side) => {
        const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xffc879 }));
        sconce.position.set(side * 11.5, 4.4, -16 + i * 4.4);
        g.add(sconce);
      });
    }
    const warmL = new THREE.PointLight(0xffb45e, 26, 30, 1.9); warmL.position.set(-9, 6, -10);
    const warmR = new THREE.PointLight(0xffb45e, 26, 30, 1.9); warmR.position.set(9, 6, -10);
    g.add(warmL, warmR, new THREE.AmbientLight(0x40281c, 1.0));

    // projector beam + dust
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 22, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfd8ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    beam.rotation.x = Math.PI / 2 - 0.12;
    beam.position.set(0, 7.4, -9);
    g.add(beam);
    const dust = motes(160, [7, 6, 20], 0.05, 0xcfd8ff);
    dust.position.set(0, 4.5, -10);
    g.add(dust);

    return {
      group: g, rig: { pos: [0, 1.55, -4.5], yaw: 0 },
      update(t) {
        dust.position.y = 4.5 + Math.sin(t * 0.12) * 0.25;
        dust.rotation.y = t * 0.008;
        beam.material.opacity = 0.045 + Math.sin(t * 9) * 0.006;
      }
    };
  }
});

/* 💎 Grotto Lumina — crystal water, glowing shards, screen in the rock */
SCENE_DEFS.push({
  id: "grotto", name: "Grotto Lumina", emoji: "💎",
  build({ THREE, motes, screenAssembly, videoMaterial }, scene) {
    const g = new THREE.Group();
    scene.background = new THREE.Color(0x02070a);
    scene.fog = new THREE.Fog(0x02070a, 12, 55);

    // cave shell: displaced icosphere, inside-out
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
      color: 0x1a2430, roughness: 1, side: THREE.BackSide, flatShading: true
    }));
    shell.position.y = 6;
    g.add(shell);

    // crystal water
    const waterMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } },
      transparent: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec2 vUv; uniform float t;
        void main(){
          vec2 p = vUv*22.;
          float w = sin(p.x+t*.8)*sin(p.y*1.3-t*.6) + sin((p.x+p.y)*.7+t*1.1)*.5;
          float sparkle = smoothstep(.92,1.,sin(p.x*3.1+t*2.)*sin(p.y*2.7-t*1.7));
          vec3 col = mix(vec3(.01,.09,.13), vec3(.05,.35,.42), .5+.5*w);
          col += vec3(.5,.95,1.)*sparkle*.6;
          float edge = smoothstep(.5,.15,distance(vUv,vec2(.5)));
          gl_FragColor = vec4(col, .88*edge);
        }`
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(15, 48), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, -6);
    g.add(water);

    // screen set into the far rock face, arch of crystals around it
    const screen = screenAssembly(9, 0x0c141c, 0.3);
    screen.position.set(0, 4.3, -16.5);
    g.add(screen);
    // its shimmering reflection in the water
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(9, 9 * 9 / 16), videoMaterial());
    refl.material.transparent = true;
    refl.material.opacity = 0.22;
    refl.position.set(0, -4.3 + 0.08, -16.5);
    refl.scale.y = -1;
    g.add(refl);

    // crystal clusters
    const crysMat = (c) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.15, metalness: 0.1, emissive: c, emissiveIntensity: 0.55,
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

    g.add(new THREE.AmbientLight(0x14303a, 1.2));
    const cyan = new THREE.PointLight(0x59e8ff, 30, 26, 1.8); cyan.position.set(-8, 3.5, -10);
    const violet = new THREE.PointLight(0x9f7bff, 26, 26, 1.8); violet.position.set(8, 3.5, -9);
    g.add(cyan, violet);

    return {
      group: g, rig: { pos: [0, 1.5, 3.5], yaw: 0 },
      update(t) {
        waterMat.uniforms.t.value = t;
        glow.rotation.y = t * 0.02;
        glow.position.y = 1 + Math.sin(t * 0.3) * 0.3;
        cyan.intensity = 28 + Math.sin(t * 1.3) * 5;
        violet.intensity = 24 + Math.sin(t * 1.7 + 2) * 5;
      }
    };
  }
});

/* 📼 Rec Room ’07 — CRT, couch, lava lamp; the year Joost shipped */
SCENE_DEFS.push({
  id: "rec07", name: "Rec Room ’07", emoji: "📼",
  build({ THREE, canvasTex, screenAssembly }, scene) {
    const g = new THREE.Group();
    scene.background = new THREE.Color(0x0b0908);
    scene.fog = new THREE.Fog(0x0b0908, 12, 40);

    // room shell
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x40372c, roughness: 1, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(14, 6.4, 16), wallMat);
    room.position.set(0, 3.2, -4);
    g.add(room);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.6, 30),
      new THREE.MeshStandardMaterial({ color: 0x6e2f1c, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.012, -5);
    g.add(rug);

    // the TV: fat CRT shell around the live screen, on a media stand
    const crt = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.15, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.55 }));
    const screen = screenAssembly(3.6, 0x191917, 0.06);
    screen.position.set(0, 0.06, 1.32);
    // faint scanlines over the tube
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6 * 9 / 16),
      new THREE.MeshBasicMaterial({
        map: canvasTex(8, 256, (x, w, h) => {
          x.clearRect(0, 0, w, h);
          x.fillStyle = "rgba(0,0,0,.55)";
          for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1.6);
        }), transparent: true, opacity: 0.28, depthWrite: false
      }));
    scan.position.set(0, 0.06, 1.42);
    crt.add(shell, screen, scan);
    crt.position.set(0, 2.15, -9.6);
    g.add(crt);

    const stand = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.8 }));
    stand.position.set(0, 0.55, -9.6);
    g.add(stand);
    // VHS deck, forever blinking 12:00
    const vhs = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x171512, roughness: 0.5 }));
    vhs.position.set(-1.2, 1.3, -9.4);
    const clockTex = canvasTex(128, 32, (x, w, h) => {
      x.fillStyle = "#020403"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#37ff8a"; x.font = "bold 24px monospace"; x.fillText("12:00", 28, 24);
    });
    const vhsClock = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2),
      new THREE.MeshBasicMaterial({ map: clockTex, transparent: true }));
    vhsClock.position.set(-1.2, 1.32, -8.68);
    g.add(vhs, vhsClock);

    // couch
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
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.6 }));
    table.position.set(0, 0.25, -5);
    g.add(table);

    // lava lamp
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
    lamp.position.set(2.6, 1.1 - 0.55, -9.2);
    lamp.position.y = 1.1;
    g.add(lamp);
    const lavaGlow = new THREE.PointLight(0xff8b3d, 9, 8, 1.9);
    lavaGlow.position.set(2.6, 1.9, -9.2);
    g.add(lavaGlow);

    // window with the 2007 night outside
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

    // test-card poster on the back wall
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.65),
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 192, (x, w, h) => {
          const bars = ["#c8c8c8", "#c8c832", "#32c8c8", "#32c832", "#c832c8", "#c83232", "#3232c8"];
          bars.forEach((c, i) => { x.fillStyle = c; x.fillRect(i * w / 7, 0, w / 7 + 1, h * 0.75); });
          x.fillStyle = "#111"; x.fillRect(0, h * 0.75, w, h * 0.25);
          x.fillStyle = "#fff"; x.font = "bold 22px Trebuchet MS, sans-serif";
          x.textAlign = "center"; x.fillText("TVP · 2007", w / 2, h * 0.92);
        })
      }));
    poster.position.set(3.4, 3.6, -11.9);
    g.add(poster);

    const warm = new THREE.PointLight(0xffc98a, 16, 18, 1.8);
    warm.position.set(-3, 4.4, -3);
    g.add(warm, new THREE.AmbientLight(0x4a4038, 1.0));

    return {
      group: g, rig: { pos: [0, 1.35, -2.2], yaw: 0 },
      update(t) {
        blobs.forEach((b, i) => {
          b.position.y = 0.55 + Math.sin(t * 0.5 + i * 2.1) * 0.28;
          const s = 0.8 + Math.sin(t * 0.7 + i * 1.4) * 0.25;
          b.scale.set(s, 1.2 - s * 0.25, s);
        });
        lavaGlow.intensity = 8 + Math.sin(t * 0.9) * 1.5;
        vhsClock.visible = Math.sin(t * 3.14) > -0.2;   // that blink
      }
    };
  }
});
