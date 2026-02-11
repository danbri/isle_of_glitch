# Glowball Gopher — Development Guide

## Vision

> Bouncing around the planet as if airport networks were trampolining routes.
> Selecting a bounce route and taking mysterious packages to destinations or intercepting those of others.
> Candy mood not grim. Trampolines take us into thin air where ISS and aurora borealis visible.
> At lower levels see street outlines tx to OpenStreetMap plus other elevation data.

**User playtesting verdict (2026-02-11):**
> "Looks glorious but is very disorienting. More experience than game.
> Will be more fun when we add more music and sounds."

The visuals work. The core game feel doesn't yet. **Stop polishing — fix the core.**

---

## Current Priorities (read this first!)

We've been spending too much energy on visual polish while the core gameplay loop is off.
The game looks beautiful but plays like a screensaver. Rebalance effort toward **game feel**.

### MUST DO — Core gameplay (before any more polish)

1. **Altitude as mechanic** — higher = faster travel but harder to land accurately. Right now altitude is purely cosmetic. This is the single biggest missing piece: it gives the charge meter strategic meaning ("do I go high and fast, or low and precise?")

2. **Pre-launch feedback** — before you release, show whether you'll overshoot. Screen shake / color shift / "TOO FAR" warning. The player needs information to make decisions, not just react.

3. **Camera tilt during charge** — lean toward aim direction so the player feels the trajectory building. Right now charge is just a filling meter with no spatial feel.

4. **Combo/streak feedback** — "Nice!" / "Perfect!" floaters on good landings. Immediate readable reward signal. Currently you deliver a package and the response is... a score number changing.

5. **Sound & music** — the user specifically said this would make it more fun. Even a simple ambient loop + varied bounce/land/deliver SFX. The game is silent except for EM hums.

### SHOULD DO — Game loop depth

6. **Interception mechanic** — intercept rival couriers (from original vision, never built)
7. **Regional delivery chains** — bonus for consecutive deliveries in same region
8. **Long-distance precision bonus** — reward BULLSEYE on hard shots
9. **Difficulty curve tuning** — first 3 deliveries should feel generous
10. **Route selection UX** — radial menus or clearer route-type feedback

### AVOID (for now)

- More visual effects, particles, shaders
- Aesthetic tweaks (color temperature, lat/long grid, magnetic arcs)
- UI micro-polish (adaptive contrast, depth fog)
- Anything that doesn't change how the game **plays**

---

## What's Working (don't break these)

- 20 real airports as bounce nodes
- Package delivery with accuracy scoring + concentric target rings
- Bounce physics with gravity, charge, trajectory preview
- Delivery choice (3 options: short/medium/long)
- Progressive difficulty (tighter timers, smaller rings)
- Earth geography with country outlines, biomes, city lights
- Atmosphere, aurora, ISS, stars (altitude-dependent visibility)
- Ring LOD (fade by distance)
- Bloom clamped sensibly (0.15 ground → 0.5 max)
- Pod visibility (dark outline shell)
- Destination name + progress bar + proximity arrow
- Debug panel hidden by default (H key)
- Free camera toggle (🌍 button)
- Smooth pod orientation (quaternion slerp, parked stance)

---

## Key Technical Notes

### Architecture
- `index.html` — UI layout, CSS, import map (Three.js r0.160.0 via CDN)
- `src/main.js` — Game loop, post-processing, input, HUD
- `src/components/Player.js` — Physics, movement, camera, orientation
- `src/systems/PackageSystem.js` — Packages, destinations, target rings
- `src/systems/TrampolineNetwork.js` — Airport bounce pads, ring LOD
- `src/components/Planet.js` — Earth surface, clouds, atmosphere
- `src/components/SpaceEnvironment.js` — Stars, ISS, satellites
- `src/components/CountryOutlines.js` — Country border lines
- `src/shaders/` — Atmosphere, aurora, planet surface, chromatic aberration

### Physics Constants (Player.js)
```javascript
gravity: 25           // Pull toward planet center
bounceForce: 12       // Upward force on bounce
airResistance: 0.008  // Speed damping
planetRadius: 10      // Game units
```

### Altitude Calculation
- Displayed altitude = (distance from center - planetRadius) × 100
- So 50.0 km displayed = 0.5 game units above surface

### Post-Processing Pipeline
- EffectComposer (NO custom render target — use default)
- RenderPass → UnrealBloomPass → ChromaticAberrationPass → OutputPass
- ACESFilmicToneMapping + SRGBColorSpace (standard pattern)
- ChromaticAberration shader forces alpha=1.0

### Confirmed Bugs & Fixes (reference only)
- **Atmosphere Fresnel**: viewVector must use `cameraPosition` + world-space normals via `modelMatrix`
- **EffectComposer**: never pass custom render target (resolution mismatch)
- **Ring orientation**: `lookAt(origin)` makes XY tangent to sphere — no extra `rotateX` needed
- **Pod jitter**: use quaternion slerp, not direct lookAt with oscillating velocity
- **`renderer.outputColorSpace`**: keep SRGBColorSpace, LinearSRGB breaks sprite transparency
- **roundRect()**: not supported on older iOS Safari, needs fallback

---

## Spec Documents

- **[Vision & Design](docs/VISION.md)** — The pitch, core loop, altitude layers, tone, name origin
- **[Gameplay Spec](docs/GAMEPLAY.md)** — How to play, scoring, mechanics, delivery choices, progressive difficulty
- **[Architecture](docs/ARCHITECTURE.md)** — File structure, rendering pipeline, physics, input, UI layout, state management
- **[Review: GPT-5.2 (2026-02-11)](docs/review-2026-02-11.md)** — bloom, clarity, mechanic feedback, mobile UX
- **[Review: Gemini (2026-02-11)](docs/review-gemini-2026-02-11.md)** — clutter, contrast, navigation clarity
- **[Backlog](docs/BACKLOG.md)** — Full task queue with sources

---

## Deployment

Push to `claude/fink-authoring-guide-*` branch (NOT main). GH Pages deploys from `claude/fink-authoring-guide-bDtaY`.

## Test Plan

1. Start game, tap to bounce — player rises AND falls back
2. Chromatic aberration minimal/absent on player
3. Follow direction arrow + progress bar to destination
4. Deliver package, verify score increments
5. Pod faces camera on ground (eyes visible), smooth transition to velocity-facing in air
6. Concentric target rings visible at destination
