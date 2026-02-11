# Glo-ball Gopher — Technical Architecture

## Stack

- **Three.js r0.160.0** via CDN import map
- WebGPU detection with WebGL2 fallback (mobile always uses WebGL2)
- **lil-gui** for debug panel
- No build step — vanilla ES modules served directly
- GitHub Pages deployment from `claude/fink-authoring-guide-bDtaY` branch

## File Structure

```
codes/globall/
├── index.html              # UI, CSS, loading screen, all DOM
├── CLAUDE.md               # Dev notes and session history
├── docs/
│   ├── GAMEPLAY.md          # Game mechanics spec
│   └── ARCHITECTURE.md      # This file
├── data/
│   └── airports.json        # ~7,900 airports (IATA, lat/lon)
└── src/
    ├── main.js              # Game loop, input, post-processing, UI
    ├── components/
    │   ├── Player.js         # Pod physics, camera, trail, cargo
    │   ├── Planet.js         # Earth mesh, atmosphere, clouds
    │   ├── AuroraBorealis.js # Aurora curtains at poles
    │   ├── SpaceEnvironment.js # Stars, ISS, satellites
    │   ├── CityLights.js    # City sprites, street grids
    │   └── CountryOutlines.js # Country border lines
    ├── systems/
    │   ├── PackageSystem.js  # Delivery logic, scoring, target rings
    │   ├── TrampolineNetwork.js # Airport nodes, route graph
    │   ├── GameState.js      # Score, deliveries, localStorage
    │   └── AudioSystem.js    # Web Audio API sounds
    └── shaders/
        ├── ChromaticAberration.js  # Edge-only RGB split
        ├── AtmosphericScattering.js # Planet rim glow
        └── PlanetSurface.js  # Day/night, city lights, clouds
```

## Rendering Pipeline

```
Renderer (WebGL2)
  → EffectComposer (HalfFloat render targets)
    → RenderPass (scene + camera)
    → UnrealBloomPass (strength: dynamic 0.3–0.7 by altitude)
    → ChromaticAberration ShaderPass (alpha forced to 1.0)
    → OutputPass (tone mapping + color space)
```

### Key Constraints (from debugging)
- **Never** pass custom render target to EffectComposer — use default
- **Never** set `renderer.outputColorSpace = LinearSRGBColorSpace`
- Keep `ACESFilmicToneMapping` + `SRGBColorSpace` + `OutputPass`
- ChromaticAberration shader must output `alpha = 1.0`

## Physics

### Planet
- Radius: 10 game units (1 unit ≈ 637 km)
- Gravity: 25, minimum 70% strength at any altitude
- Hard altitude ceiling prevents escape

### Player (Pod)
- Bounce force: 12 (base) × route type multiplier × chain bonus
- Air resistance: 0.008
- Bounce threshold: 0.3 (altitude units)
- Steering: analog touch (-1 to 1) or WASD binary

### Route Types
| Type | Hold | Force | Arc |
|------|------|-------|-----|
| Scenic (Quick Pulse) | <200ms | Low | Low, gentle |
| Express (Mag Launch) | 200–600ms | High | High, powerful |
| Stealth (Long Range) | >600ms | Medium | Low, far |

## Airport Network

- ~7,900 airports loaded from `data/airports.json`
- Top 20 shown as trampoline pads with EM coil visuals
- Route graph connects airports within ~5 units
- `getNearestTrampoline(position)` for spatial queries
- `getConnectedAirports(iata)` for graph traversal

## Coordinate System

- Planet centered at origin (0, 0, 0)
- Airports positioned on sphere surface using lat/lon → cartesian
- Altitude = distance from center - planetRadius (in game units)
- Display: altitude × 100 = km shown to player

## Audio

Web Audio API with procedural synthesis:
- Bounce sound (pitch varies with charge)
- Charge-up whine (pitch rises during hold)
- Landing thud (scales with impact speed)
- Proximity ping (when near destination)
- Timer warning beep
- Delivery chime
- Combo sound (pitch rises with multiplier)

## Input Architecture

### Mobile
- **LAUNCH button**: touchstart → charge, touchend → fire
- **Canvas swipe**: analog steering (deadzone 8px, max 80px)
- **Canvas tap**: select airport target
- **Delivery choice buttons**: touchend → accept delivery

### Desktop
- **Space**: hold to charge, release to fire
- **WASD / Arrows**: binary steering
- **Click**: select airport
- **H**: toggle debug panel

## UI Panels

| Element | Position | Purpose |
|---------|----------|---------|
| Session timer | Top center | 3:00 countdown |
| Altitude | Top right | Current height in km |
| Package info | Top left | Package name + destination |
| Score | Below altitude | Points + delivery count |
| Timer bar | Below package | Delivery time remaining |
| Direction arrow | Center top | Points toward target |
| Combo display | Center | Multiplier + countdown |
| Delivery choice | Bottom center | 3 option buttons |
| Location info | Bottom left | Nearest airport + target |
| LAUNCH button | Bottom right | Hold-to-charge bounce |

## State Management

- `GameState`: score, deliveries, localStorage persistence
- `PackageSystem`: current package, choices, combo, timer
- `session`: started/ended, time limit, best stats
- High scores: `globall_highscore`, `globall_best_deliveries`, `globall_games`

## Debug Panel (lil-gui, press H)

- Visibility toggles for all scene components
- Post-processing controls (bloom, chromatic, tone mapping)
- Scene component isolation
- Camera settings (lerp, FOV, clip planes)
- Live info (FPS, camera/player position, altitude, velocity)
- Trackball controls toggle
