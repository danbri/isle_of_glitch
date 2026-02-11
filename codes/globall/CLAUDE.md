# Globall - Development Notes

## Original Vision

> In codes/globall/ make a game designed to look beautiful and be set planetwide with threejs and sota exploitation of webgpu for 90hz gameplay, compositing and shaders for city and natural lighting effects and a dynamic based on the idea of literally bouncing around the planet as if airport networks were trampolining routes. Gameplay involves selecting a bounce route and taking mysterious packages to destinations or intercepting those of others. Candy mood not grim. The trampolines take us up into thin air where ISS and aurora borealis visible. At lower levels we see street outlines thanks to OpenStreetMap plus other elevation etc data. Pure realism not needed but some beautiful and fun.

### Key Goals
- **Beautiful planetwide 3D** - Three.js with WebGPU for 90Hz
- **Trampoline bouncing** - Airport networks as bounce routes
- **Package delivery** - Deliver packages OR intercept rivals'
- **Candy aesthetic** - Colorful, fun, not grim
- **Altitude layers**:
  - High: ISS, aurora borealis visible
  - Low: Street outlines, city lights, elevation
- **Route selection** - Choose your bounce trajectory

---

## Initial Implementation (v1)

The first version had these components but major UX/rendering issues:

### Core Engine (`src/main.js`)
- WebGPU detection with WebGL fallback
- 90Hz target framerate
- Post-processing pipeline (bloom, chromatic aberration)
- Dynamic shader parameters based on player state

### Visual Components
- `Planet.js` - Procedural Earth with day/night textures, city lights, animated clouds
- `SpaceEnvironment.js` - 10,000 twinkling stars, orbiting ISS, satellites, distant galaxies
- `AuroraBorealis.js` - Animated aurora curtains at polar regions (visible at high altitude)
- `CityLights.js` - 20 major cities + 100 procedural, candy-colored lights, OSM-inspired street grids

### Gameplay Systems
- `TrampolineNetwork.js` - 20 major airports as trampoline nodes with arc connections
- `PackageSystem.js` - 8 mysterious package types (Quantum Container, Dream Fragment, etc.), rival couriers
- `Player.js` - Bounce physics, trail rendering, squash/stretch animation
- `GameState.js` - Scoring, achievements, level progression, local storage persistence

### Shaders
- Atmospheric scattering for planet rim glow
- Aurora with multi-octave noise animation
- Chromatic aberration (FLAWED - applied uniformly causing RGB separation)
- Planet surface with day/night blending

### Controls (Intended)
- WASD/Arrows - Directional influence while airborne
- Space - Bounce (when charged)
- E - Interact with packages
- 1/2/3 - Select route type (Express/Scenic/Stealth)
- Click trampolines - Set target destination
- Touch: Tap to bounce, swipe to steer

### Known Flaws in v1
1. **White screen / bleachout** - Excessive bloom at high altitude
2. **Chromatic aberration** - Applied uniformly, player appeared as RGB-separated circles
3. **Gravity escape** - Player could bounce to 8000+ km and never fall back
4. **Route modes invisible** - Buttons selected but had no perceptible effect
5. **No wayfinding** - Destination name shown but no visual guidance
6. **Mobile hostile** - UI overlays too large, controls unexplained

---

## User Feedback Summary (from screenshots)

### Critical Issues Identified
1. **Chromatic aberration causing RGB separation** - Player character appears as separated red/green/blue circles. Effect applies uniformly across screen instead of just edges.

2. **Altitude keeps rising, player never falls** - Gravity too weak at altitude, player reaches 8000+ km and keeps going. Should fall back to planet.

3. **Route mode buttons do nothing perceptible** - Express Arc, Scenic Hop, Night Glide buttons visually select but have no visible effect on gameplay.

4. **No destination guidance** - Package shows destination name but no visual indicator of where to go.

5. **Mobile UI too large/intrusive** - Overlays cover too much of the screen, controls are cryptic, no tutorial.

6. **Ground-level bleachout** - Excessive bloom effect at low altitudes causing white screen.

---

## Fixes Applied (This Session)

### 1. Physics Overhaul (`src/components/Player.js`)
- **Gravity**: Increased from 9.8 to 25, with minimum 70% strength at any altitude
- **Air resistance**: Reduced to let gravity dominate
- **Bounce**: Lowered threshold (0.3 instead of 0.5), cancels downward velocity for snappier response
- **Ground collision**: Full recharge on ground contact, better bounce physics

### 2. Chromatic Aberration Fix (`src/shaders/ChromaticAberration.js`)
- Effect now only applies at screen edges (center stays clean)
- Amount drastically reduced (0.0003 base, scales slowly with speed)

### 3. Destination Guidance (`src/systems/PackageSystem.js`)
- Added destination marker (green beacon) at target location
- Added dashed guide line from player to destination
- Destinations now mapped to actual trampoline locations

### 4. Route Mode Camera Effects (`src/components/Player.js`)
- Each route type now has distinct camera perspective:
  - Express Arc: Higher camera angle for aerial view
  - Scenic Hop: Side view for sightseeing
  - Night Glide: Low following camera
- Camera zooms out dynamically at higher altitudes

### 5. Mobile UI Improvements (`index.html`)
- All panels made more compact (smaller padding, fonts, sizes)
- Added tutorial hint overlay explaining controls
- Added direction indicator arrow pointing to destination

### 6. Bloom Fixes (`src/main.js`)
- Base bloom reduced (0.5 strength, 0.9 threshold)
- Dynamic bloom: 0.3 at ground, max 0.7 in space
- Tone mapping exposure reduced from 1.2 to 1.0

---

## Known Remaining Issues

1. **May need further gravity tuning** - If player still escapes, increase gravity further or add hard altitude ceiling

2. **Package delivery not fully wired** - Collecting packages at destination not clearly working

---

## Session 2 Fixes (Whiteout)

### Root Causes Found
- Atmosphere glow intensity was 1.5 with AdditiveBlending
- Clouds used AdditiveBlending
- Planet surface shader had city lights multiplied by 2.0
- Cloud color was pure white vec3(1.0)
- Fresnel rim lighting adding 0.5 intensity

### Fixes Applied
1. **Atmosphere** (`src/components/Planet.js`):
   - glowIntensity: 1.5 → 0.6
   - Changed from AdditiveBlending to NormalBlending
   - Darker glow color

2. **Clouds** (`src/components/Planet.js`):
   - opacity: 0.4 → 0.25
   - Changed from AdditiveBlending to NormalBlending

3. **Planet Surface Shader** (`src/shaders/PlanetSurface.js`):
   - City lights multiplier: 2.0 → 0.8
   - Cloud shadow factor: 0.3 → 0.2
   - Cloud color: 1.0 → 0.9, with 0.5 multiplier
   - Fresnel rim: 0.5 → 0.2

---

## Architecture Notes

### Key Files
- `index.html` - UI layout, CSS, loading screen
- `src/main.js` - Game loop, post-processing, input handling
- `src/components/Player.js` - Player physics, movement, camera
- `src/systems/PackageSystem.js` - Packages, destinations, rivals
- `src/systems/TrampolineNetwork.js` - Bounce pads at world airports

### Physics Constants (Player.js)
```javascript
gravity: 25           // Pull toward planet center
bounceForce: 12       // Upward force on bounce
airResistance: 0.008  // Speed damping
planetRadius: 10      // Game units
```

### Altitude Calculation
- Displayed altitude = (distance from center - planetRadius) * 100
- So 50.0 km displayed = 0.5 game units above surface

---

## Session 3 Fixes (Splash Screen Hang)

### Root Cause
- `roundRect()` canvas method not supported on older iOS Safari versions (pre-Safari 16)
- Game initialization had no error handling, so failures were silent

### Fixes Applied
1. **TrampolineNetwork.js**: Added fallback for `roundRect()` - uses `fillRect()` if not available
2. **main.js**: Added try/catch around initialization with error display
3. **main.js**: Added console.log statements to track component loading progress

---

## Session 4 Fixes (Black Cutout Templates / Post-Processing)

### Symptom
Game renders with black cutout templates when post-processing is enabled. Disabling the
EffectComposer pipeline (falling back to direct renderer.render) eliminated the artifacts.

### Primary Hypothesis: Alpha Channel Bleed
The scene contains many transparent objects (stars, aurora, city sprites, glow sprites,
atmosphere meshes) using `transparent: true` with `AdditiveBlending`. These write alpha < 1.0
into the EffectComposer's RGBA HalfFloat render targets.

When the ChromaticAberration ShaderPass renders with NormalBlending (the Three.js default
for ShaderPass), pixels with alpha < 1.0 are darkened:
`RGB_out = src.rgb * src.a + dst.rgb * (1 - src.a)`
producing black/dark shapes wherever transparent objects rendered.

**Note**: This is a hypothesis based on code analysis. If artifacts persist, the fine-grained
debug controls (below) can isolate which pass is responsible by toggling them individually.

### Alternative Hypotheses (if primary fix doesn't resolve)
- `logarithmicDepthBuffer: true` could cause depth-related artifacts in render targets
- Color space double-application between renderer settings and OutputPass
- UnrealBloomPass internal composite alpha handling
- Browser/GPU-specific WebGL framebuffer behavior

### Fixes Applied
1. **ChromaticAberration shader** (`src/shaders/ChromaticAberration.js`):
   - Force `alpha = 1.0` in output: `gl_FragColor = vec4(cr.r, cg.g, cb.b, 1.0)`
   - Prevents alpha bleed from scene transparent objects through the pipeline

2. **EffectComposer render target** (`src/main.js`):
   - Explicit `WebGLRenderTarget` with `stencilBuffer: false` matching renderer config
   - Stored references to all passes (`renderPass`, `bloomPass`, `chromaticPass`, `outputPass`)

3. **Fine-grained post-processing debug controls** (`src/main.js`):
   - Master enable/disable for entire pipeline
   - Bloom subfolder: enable, strength (0-3), radius (0-1), threshold (0-1), altitude scaling toggle
   - Chromatic Aberration subfolder: enable, base amount, speed scaling toggle, angle
   - Tone Mapping subfolder: exposure (0-3)
   - Each pass can be toggled independently to isolate rendering issues

4. **Orbit controls re-enabled** (`src/main.js`, `src/components/Player.js`):
   - Orbit controls enabled by default (not implicated in post-processing issue)
   - Added `cameraEnabled` flag to Player for mutual exclusion with orbit controls
   - Debug panel toggle switches between orbit controls and player camera

---

## Deployment Workflow

**IMPORTANT**: Push changes to `claude/fink-authoring-guide-*` branch, NOT main!

The `claude/fink-authoring-guide-bDtaY` branch is configured for Claude pushes and triggers GitHub Pages deployment.

```bash
# After making changes:
git add <files>
git commit -m "Description"
git push -u origin claude/fink-authoring-guide-bDtaY
```

---

## Spec Documents

- **[Gameplay Spec](docs/GAMEPLAY.md)** — How to play, scoring, mechanics, delivery choices, progressive difficulty
- **[Architecture](docs/ARCHITECTURE.md)** — File structure, rendering pipeline, physics, input, UI layout, state management
- **[Review 2026-02-11](docs/review-2026-02-11.md)** — External review from GPT-5.2 (iOS screenshots): bloom, clarity, mechanic feedback, mobile UX
- **[Backlog](docs/BACKLOG.md)** — Prioritized task queue (P0–P4) from review + prior sessions

---

## Test Plan

1. Start game, tap to bounce
2. Verify player rises AND falls back down
3. Check chromatic aberration is minimal/absent on player
4. Select different route modes, verify camera changes
5. Follow green guide line to destination
6. Deliver package, verify score increments
