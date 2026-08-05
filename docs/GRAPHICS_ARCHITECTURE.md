# GLOBALL Graphics & Rendering Architecture

This document describes the graphics and rendering system for the GLOBALL game, including the camera system, world rendering, layer management, and the main render loop.

## Overview

The game uses **Three.js 3D engine** (v0.160.0) with **WebGL renderer**. The architecture follows a modular component-based approach with a custom post-processing pipeline.

---

## 1. Camera System

**File:** `src/components/Player.js` (lines 382-408)

### Architecture
- **Type:** Player-following third-person camera with dynamic zoom
- **Orbit Controls:** Secondary development controls in `main.js`

### Dynamic Camera Position
```javascript
updateCameraPosition() {
    // Dynamic zoom based on altitude (1x to 4x at high altitude)
    const zoomFactor = 1 + Math.min(altitude * 0.15, 3);

    // Route-type camera tilts for different perspectives:
    // Express Arc: Higher angle (y:4, z:6) for aerial view
    // Scenic Hop: Side view (y:2, z:8) for city sightseeing
    // Night Glide: Low following (y:1, z:10) for stealth

    // Lerp to target position with 0.08 speed
    this.camera.position.lerp(cameraTargetPos, 0.08);
    this.camera.lookAt(this.position);
}
```

### Key Properties
| Property | Value | Notes |
|----------|-------|-------|
| Near clip | 0.1 | Close objects visible |
| Far clip | 100,000 | Large range for planetwide scale |
| FOV | 60 degrees | Standard perspective |
| Type | PerspectiveCamera | 3D perspective projection |

---

## 2. Planet/Terrain Rendering

**File:** `src/components/Planet.js`

### Planetary Surface Structure
- **Geometry:** SphereGeometry (128x128 segments) at radius 10 units
- **Material:** Custom `PlanetSurfaceShader` with multiple texture layers

### Procedural Textures (all 2048x1024 canvas-based)
1. **Day Texture** - Procedurally generated continents with candy colors (greens, mint, desert)
2. **Night Texture** - Dark continents for night side
3. **City Lights Texture** - 11 major cities + 200 procedural city lights
4. **Clouds Texture** - 100+ procedural clouds with blur
5. **Bump Map** - Multi-octave noise for surface detail

### Shader Blending (PlanetSurfaceShader)
```javascript
// Combines:
// - Day/Night textures based on sun direction
// - City lights (0.8x multiplier for night visibility)
// - Clouds (0.25 opacity with NormalBlending)
// - Bump mapping for relief
// - Fresnel rim lighting (0.2 intensity)
```

### Atmosphere Layer
- **Geometry:** SphereGeometry at 10.5 units (0.5 unit larger than planet)
- **Material:** Custom `AtmosphericScatteringShader`
- **Properties:**
  - Color: RGB(0.4, 0.7, 1.0) - blue tint
  - Glow Intensity: 0.6 (reduced from 1.5 to prevent bleachout)
  - Blending: NormalBlending (changed from Additive to reduce whiteout)
  - Side: BackSide (only visible from inside)
  - Depth Write: false

---

## 3. Rendering Layers & Z-Ordering

### Scene Background
```javascript
this.scene.background = new THREE.Color(0x1a0a2e); // Deep space blue
this.renderer.setClearColor(0x1a0a2e, 1);
```

### Layer Stack (Bottom to Top)

| Order | Layer | Description |
|-------|-------|-------------|
| 1 | Base Planet | Planet surface mesh |
| 2 | Atmosphere Glow | Rim lighting around planet |
| 3 | Clouds | Semi-transparent overlay (opacity 0.25) |
| 4 | Starfield | 10,000 points with AdditiveBlending |
| 5 | ISS & Satellites | Orbiting space objects |
| 6 | Aurora Borealis | 8 curtains for northern lights + particles |
| 7 | City Lights | Major cities + 100 procedural cities |
| 8 | Street Grids | OSM-inspired street patterns (LOD controlled) |
| 9 | Trampolines | Interactive bounce pads on surface |
| 10 | Player | Character + trail |
| 11 | Packages & Markers | Interactive elements |

### LOD (Level of Detail) System

**CityLights Component:**
```javascript
// City visibility based on camera distance
const distance = camera.position.distanceTo(cityGroup.position);
const scale = Math.min(2, Math.max(0.5, 30 / distance));

// Street grids only show when close
streetGroup.visible = distance < 8;
opacity = Math.max(0, 1 - distance / 8);
```

### Z-Ordering Management
- No explicit z-index (uses 3D depth naturally)
- **depthWrite: false** used for:
  - Atmosphere
  - Clouds
  - Stars
  - Aurora
  - Post-processing effects
- Depth buffer enabled on renderer with PCFSoft shadows

---

## 4. Sky/Background Rendering

### Starfield
**File:** `src/components/SpaceEnvironment.js` (lines 23-110)

```javascript
// 10,000 stars distributed on 500-1000 unit sphere
const starCount = 10000;
const colorPalette = [white, warm-white, cool-white, red-giant, blue-star, yellow-star];

// Vertex shader: Twinkle effect
float twinkle = sin(time * 2.0 + position.x * 0.01) * 0.2 + 0.8;
gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);

// Fragment shader: Soft glow with smoothstep
float alpha = smoothstep(0.5, 0.0, dist);
float core = smoothstep(0.2, 0.0, dist);
```

**Properties:**
- Blending: AdditiveBlending (stars add light to scene)
- Size variation: 0.5-1.5 pixels (with 2% bright stars at 3-5px)
- Depth Write: false

### Aurora Borealis
**File:** `src/components/AuroraBorealis.js`

```javascript
// 8 curtains for Northern lights + 4 for Southern lights
// Each curtain: PlaneGeometry curved into polar regions
// Altitude: 12 units (just above atmosphere at 10.5)

// Animation: Multi-octave simplex noise
// Colors: Green (0x00ff88), Cyan (0x00ddff), Pink (0xff44aa)
// Visible based on player altitude (scales with altitude)
```

### Hemisphere Light
```javascript
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362312, 0.4);
// Sky color: Sky blue (0x87ceeb)
// Ground color: Dark brown (0x362312)
// Intensity: 0.4
```

---

## 5. Main Game Loop & Render Cycle

**File:** `src/main.js` (lines 529-574)

### Game Loop Structure

```javascript
animate(currentTime = 0) {
    requestAnimationFrame((t) => this.animate(t));

    // ===== UPDATE PHASE =====

    // 1. Calculate delta time (capped at 100ms to prevent large jumps)
    this.deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);

    // 2. Update orbit controls (development camera)
    this.controls.update();

    // 3. Get elapsed time
    const time = currentTime * 0.001;

    // ===== COMPONENT UPDATES =====

    this.planet.update(time, deltaTime);
    // - Rotates planet.rotation.y += deltaTime * 0.02
    // - Rotates clouds slightly faster (0.025)
    // - Updates shader uniforms

    this.cityLights.update(time, deltaTime, camera);
    // - Updates city light opacity based on day/night
    // - Pulsing effect: Math.sin(time * 2 + position.x)
    // - LOD scaling based on camera distance
    // - Street grid visibility toggle (distance < 8)

    this.spaceEnv.update(time, deltaTime);
    // - Updates star twinkle uniforms
    // - Animates ISS orbit

    this.aurora.update(time, deltaTime, playerPosition);
    // - Animates curtain movement with noise
    // - Fades based on player altitude

    this.trampolineNetwork.update(time, deltaTime);
    // - Updates trampoline animations

    this.player.update(time, deltaTime, keys);
    // - Physics: gravity, velocity, acceleration
    // - Ground collision detection
    // - Camera position update
    // - Trail rendering
    // - Mesh orientation/squash-stretch

    this.packageSystem.update(time, deltaTime, player);
    // - Updates destination marker position
    // - Updates guide line
    // - Manages package pickup/delivery

    // ===== SHADER UNIFORM UPDATES =====

    // Chromatic aberration scales with player speed
    this.chromaticPass.uniforms.amount.value = 0.0003 + speed * 0.0008;

    // Bloom scales with altitude
    // Ground (0-5km): 0.3-0.4
    // Space (50km+): max 0.7
    this.bloomPass.strength = Math.min(0.7, 0.3 + Math.min(altitude / 200, 0.4));

    // ===== RENDER PHASE =====

    this.composer.render(); // Uses EffectComposer for post-processing
}
```

### Post-Processing Pipeline

**File:** `main.js` (lines 201-223)

```
EffectComposer pipeline:
1. RenderPass - Main scene render
2. UnrealBloomPass
   - Strength: 0.5 (reduced for mobile clarity)
   - Radius: 0.3
   - Threshold: 0.9 (only bloom brightest elements)
3. ShaderPass (ChromaticAberration)
   - Amount: 0.0003 base + speed modifier
   - Only applies at screen edges
4. (Implicit) Tone mapping:
   - ACESFilmicToneMapping
   - Exposure: 1.0 (reduced from 1.2)
```

### Renderer Configuration

```javascript
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,  // For extreme far clip (100,000)
    stencil: false
});

renderer.setClearColor(0x1a0a2e, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));  // Mobile optimization
```

---

## 6. Known Issues & Mobile Considerations

### Black Screen Symptoms
Large black areas appearing where the game world should be visible, with occasional glimpses of:
- Terrain silhouettes
- Aurora lights
- City lights at horizon
- Landmarks (Eiffel Tower visible)

### Likely Causes

1. **Camera Position Issues**
   - Camera lerp speed (0.08) may be too slow, causing camera to lag behind player
   - If player position calculations fail, camera could point at empty space

2. **Layer Visibility**
   - Scene background (0x1a0a2e) is very dark purple
   - If layers fail to render, only background shows

3. **Post-Processing Problems**
   - Bloom/tone mapping could be hiding dim elements
   - High bloom threshold (0.9) may hide dimly-lit objects

4. **Depth Buffer Precision**
   - Far clip at 100,000 with logarithmic depth buffer
   - Potential precision issues on mobile GPUs

5. **Mobile-Specific Issues**
   - `roundRect()` canvas method not supported on older iOS Safari (pre-Safari 16)
   - Silent shader compilation failures
   - WebGL context loss not handled

### Critical Files for Debugging

| File | Purpose | Issue Risk |
|------|---------|------------|
| `src/components/Player.js` | Camera + player physics | HIGH |
| `src/main.js` | Game loop + rendering | HIGH |
| `src/shaders/PlanetSurface.js` | Planet rendering | MEDIUM |
| `index.html` | Setup + error handlers | MEDIUM |

### Recommended Debug Steps

1. Check if `player.position` is set correctly on init
2. Verify camera lerp isn't lagging too far behind
3. Ensure planet is visible at initial camera position (0, 0, 25)
4. Check mobile pixel ratio handling (capped at 2x)
5. Review bloom threshold - 0.9 might hide dim objects
6. Add WebGL context loss recovery
7. Add shader compilation error logging

---

## 7. Scale Reference

| Element | Size (units) | Real-world equivalent |
|---------|--------------|----------------------|
| Planet radius | 10 | ~6,371 km (Earth) |
| Atmosphere | 10.5 | ~100 km above surface |
| Aurora altitude | 12 | ~100-300 km |
| Player altitude range | 10.01 - 290+ | 0.1 km - 280+ km |
| Starfield | 500-1000 | Deep space |
| Camera far clip | 100,000 | Entire solar system scale |

---

## 8. Black Screen Issue Analysis

Based on code review, the black areas in screenshots appear to be the scene background (`0x1a0a2e`) showing through where the game world should be rendered.

### Observed Symptoms
- Large black/dark purple areas dominating the screen
- Occasional glimpses of: terrain silhouettes, aurora lights, city lights, landmarks
- Problem appears worse at higher altitudes (280km screenshot vs 39km screenshots)
- Earth curvature visible as dark silhouette against black

### Root Cause Hypotheses

#### 1. Camera Positioning / Player Tracking Issue
**Likelihood: HIGH**

The camera follows the player with lerp smoothing:
```javascript
// Player.js:406
this.camera.position.lerp(cameraTargetPos, 0.08);
```

**Problems identified:**
- Lerp factor 0.08 is very slow - camera takes many frames to catch up
- Initial camera position (0, 0, 25) vs player position (0, 12, 0) creates initial mismatch
- At high velocities, camera could lag far behind player
- Camera target calculated using `velocity.normalize()` - if velocity is near zero, this could produce unstable results

**Code path:**
```
Player.update() → updateCameraPosition() → lerp to target
```

If player is moving fast, camera position lags and could be looking at empty space.

#### 2. Planet Not In View
**Likelihood: HIGH**

The planet is at origin with radius 10. If camera position or lookAt target are incorrect:
- Camera could be pointing away from planet
- Camera could be inside the planet (clipped by near plane)
- Camera could be so far that planet is tiny

**Key coordinates:**
- Planet center: (0, 0, 0)
- Planet radius: 10 units
- Player start: (0, 12, 0) - just above north pole
- Camera far: 100,000 units

#### 3. Atmosphere Rendering Side
**Likelihood: MEDIUM**

```javascript
// Planet.js:384
side: THREE.BackSide
```

Atmosphere only renders when viewed from inside (BackSide). At high altitudes, player is outside the atmosphere sphere (radius 10.5), so atmosphere becomes invisible from that perspective.

#### 4. Depth Buffer Precision
**Likelihood: MEDIUM**

```javascript
// main.js:137
logarithmicDepthBuffer: true
```

With near: 0.1 and far: 100,000, that's a 1:1,000,000 ratio. Even with logarithmic depth buffer, mobile GPUs may have precision issues causing z-fighting or incorrect depth tests.

#### 5. Post-Processing Bloom Threshold
**Likelihood: LOW-MEDIUM**

```javascript
// main.js:213
0.9   // threshold - only bloom brightest elements
```

High threshold means only very bright elements get bloom. Combined with:
- ACESFilmicToneMapping
- toneMappingExposure: 1.0

Dark elements could become nearly invisible.

### Debugging Recommendations

1. **Add camera position logging**
   ```javascript
   console.log('Camera:', camera.position, 'Player:', player.position);
   ```

2. **Increase lerp speed temporarily**
   ```javascript
   this.camera.position.lerp(cameraTargetPos, 0.3); // Test with faster lerp
   ```

3. **Add visual debug markers**
   - Sphere at planet center
   - Line from camera to player
   - Frustum visualization

4. **Test without post-processing**
   ```javascript
   this.renderer.render(this.scene, this.camera); // Instead of composer.render()
   ```

5. **Verify OrbitControls interaction**
   OrbitControls might be fighting with Player camera updates

6. **Check mobile touch events**
   Touch handling could be affecting camera unexpectedly

### Specific Code Locations to Investigate

| Issue | File | Line | What to check |
|-------|------|------|---------------|
| Camera lerp | Player.js | 406 | Lerp speed too slow |
| Camera target | Player.js | 402-404 | Target calculation |
| Velocity normalize | Player.js | 385-387 | Division by near-zero |
| Scene background | main.js | 161 | Too dark |
| Orbit controls | main.js | 173-178 | Conflicting with player camera |
| Atmosphere side | Planet.js | 384 | BackSide only |
| Depth buffer | main.js | 137 | Mobile precision |

---

*Last updated: Session investigating black screen rendering issues*
