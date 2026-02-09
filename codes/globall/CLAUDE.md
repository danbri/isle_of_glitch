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

1. **Changes not yet deployed** - Need to commit and push for live testing

2. **May need further gravity tuning** - If player still escapes, increase gravity further or add hard altitude ceiling

3. **Package delivery not fully wired** - Collecting packages at destination not clearly working

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

## Test Plan

1. Start game, tap to bounce
2. Verify player rises AND falls back down
3. Check chromatic aberration is minimal/absent on player
4. Select different route modes, verify camera changes
5. Follow green guide line to destination
6. Deliver package, verify score increments
