# Glowball Gopher — Development Guide

## Vision

> Bouncing around the planet as if airport networks were trampolining routes.
> Selecting a bounce route and taking mysterious packages to destinations or intercepting those of others.
> Candy mood not grim. Trampolines take us into thin air where ISS and aurora borealis visible.
> At lower levels see street outlines tx to OpenStreetMap plus other elevation data.

**User playtesting verdicts (2026-02-11):**
> "Looks glorious but is very disorienting. More experience than game."

> "This is supposedly set on real planet earth, and yet I just don't feel it.
> We are supposed to be flying over EARTH not over Google Maps. Nothing is recognizable.
> Why do I see dozens of rings together in one place??
> Also there is a compositing error where a ring is set in a bounding box that doesn't mix properly.
> The idea was that you might be in GLASGOW and have to deliver to KYOTO — through
> Gatwick/Heathrow to Narita then Kyoto. Or through Greenland/Anchorage/Vladivostok.
> There is a subtext of graph theory lurking. To make the graph route thing compelling
> it needs a way to be clearer about current node and those it can route to —
> when on Narita you might have a radial dialog to pick next hop."

**Two core failures: (1) doesn't feel like Earth, (2) no graph-routing mechanic.**

---

## Current Priorities (read this first!)

### P0 — Sense of place + graph routing (fundamental, do first)

1. **Planet doesn't feel like Earth** — Procedural texture with ellipsoidal continent zones is too abstract. Consider NASA Blue Marble texture (public domain) or dramatically improve continent rendering. Country outlines help but aren't enough alone.

2. **Airport clustering** — 1269 airports loaded, many within fractions of a game unit (LHR to LGW = 0.064 units, ring radius = 0.3 units). They overlap completely. Need to curate ~50-80 major hub airports for interactive nodes. Keep all 1269 as dots for atmosphere. Use route-graph degree to auto-select hubs.

3. **Ring compositing error** — Detailed airport rings use `rotateX(PI/2)` making them edge-on (same bug we fixed in PackageSystem). Sprite bounding boxes show through. Remove the rotateX.

4. **Graph routing mechanic** — The route graph exists (13,143 route pairs) but is only used for faint visual arcs. Need hop-by-hop navigation: land at airport → radial dialog shows connected airports → pick next hop → bounce there. This IS the game. Glasgow → Heathrow → Narita → Kyoto.

### P1 — Game feel (after P0 is solid)

5. **Altitude as mechanic** — higher = faster but harder to land
6. **Pre-launch overshoot warning** — feedback before release
7. **Camera tilt during charge** — spatial feel for trajectory
8. **Combo/streak feedback** — "Nice!" / "Perfect!" floaters
9. **Sound & music** — ambient + bounce/land/deliver SFX

### SHOULD DO — Game loop depth

10. **Interception mechanic** — intercept rival couriers (original vision)
11. **Regional delivery chains** — bonus for same-region consecutive deliveries
12. **Long-distance precision bonus** — reward BULLSEYE on hard shots
13. **Difficulty curve tuning** — first 3 deliveries should feel generous

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
