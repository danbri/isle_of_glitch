# 06 -- Sound & Feel Design: Glo-ball Gopher

> "A game is a series of interesting decisions." -- Sid Meier.
> But decisions don't land unless the player's *body* understands the stakes.
> Sound and feel are the connective tissue between input and meaning.

---

## 1. The Kinesthetic Vocabulary

Every action in Glo-ball Gopher is a **verb**. Each verb needs a distinct physical signature -- a weight, a texture, a rhythm that the player's hands learn before their brain does. Here is the complete verb lexicon.

### CHARGE (hold to build)

**Feel**: Compression. A spring being wound. The world gets heavier.

The charge is *potential* becoming *visible*. The pod should feel like it is sinking into the trampoline pad, storing energy in the electromagnetic field beneath it. The camera tilts downward 3-5 degrees (into the planet), FOV narrows 2-3 degrees (tunnel focus), and the pod's squash increases proportionally -- at full charge the pod is 30% wider and 25% shorter than resting state. The screen subtly vignettes at the edges. Everything says: "energy is coiling."

The existing charge growl (55Hz sawtooth pair rising to 455Hz with opening filter) is a strong foundation. What it lacks is *physical weight*. The sub-bass at 30Hz is the right instinct but needs more gain at full charge -- the player should feel their phone or headphones vibrate. The missing element is a rhythmic pulse: a heartbeat-like throb at 2-3Hz that accelerates to 6-8Hz as charge builds, like a Geiger counter approaching critical mass. This pulse provides urgency feedback even without looking at the charge ring.

**Reference**: Celeste's dash charge. The 2-frame freeze before Madeline moves communicates "this matters." We can't freeze a browser game, but the camera tilt + FOV squeeze achieve the same contraction.

### LAUNCH (release to fire)

**Feel**: Release. Explosive decompression. A champagne cork.

The moment of release is the most important frame in the game. It must feel *instantaneous and irreversible*. The squash reverses to stretch in under 100ms (3 frames at 30fps). The camera snaps back to neutral tilt within 150ms, then overshoots 1-2 degrees past neutral (a subtle whiplash). FOV punches out by 5-8 degrees for 200ms, then settles. A 2-frame screen shake (intensity 0.03-0.04, decay 0.85) adds percussive impact without disorientation.

The existing bounce sound (sawtooth sweep 800Hz->80Hz + noise burst) is good but too smooth. It needs a harder transient -- a 1ms click at the very start of the envelope (gain spike to 0.3 then immediate drop to 0.15). This is the "snap" that tells the player the action registered. Think of the difference between pressing a membrane keyboard and a mechanical switch. The click is certainty.

**Timing**: The entire launch response (visual + audio) must complete its initial transient within 50ms of input release. Anything slower and the game feels sluggish. Web Audio API scheduling via `ctx.currentTime` makes this achievable.

**Reference**: Angry Birds' slingshot release. The bird doesn't ease out of the pouch; it *snaps*. The trail appears immediately. The player never doubts the shot fired.

### FLY (mid-air traversal)

**Feel**: Weight suspended. Controlled falling. An astronaut's grace.

Flight is the longest verb. It should feel like the pod has *mass* -- heavy but not sluggish. The wind layer (existing bandpass noise, 300Hz-2300Hz scaling with speed) is the primary texture here. Currently it ramps linearly. It should ramp with a slight curve: gentle below speed 5, then accelerating presence above speed 8. This matches the physics where air resistance matters more at higher speeds.

At peak altitude, the wind layer should thin and shift down in pitch (filter center drops from 2000Hz to 600Hz). In real life, thin air means less noise. The silence at apogee is itself a feeling -- the held breath before descent. The ambient drone already fades above 200km altitude (the spaceHush calculation), which is correct. Add a subtle high-pass filter on the master bus above 300km altitude to thin out bass, reinforcing the vacuum feeling.

Steering should have no dedicated sound -- it's a modifier, not a verb. But course corrections should subtly shift the stereo balance of the wind noise, creating an audio sense of "turning." Pan the wind layer 10-20% toward the opposite side of the steer direction. Player steers right, wind shifts left. This is how sound works in cars.

**Reference**: Journey's sand-surfing sections. The wind is always present, always *felt*, but it's the silence at the top of each dune that makes the descent exhilarating.

### STEER (mid-air direction adjustment)

**Feel**: Leaning. Tipping your weight. A skateboard carve.

Steering is subtle by design -- it adjusts, it doesn't dominate. The existing wing banking (rotateZ based on steer input) is correct. Add a proportional camera roll of 2-4 degrees in the steer direction (camera rolls *with* the pod, not against it). This creates the feeling of the whole world tilting, which is how G-forces feel in real flight.

No dedicated sound effect. The wind stereo shift (described above) handles audio feedback. The steering force feels right in the code (baseForce 5 + airBonus up to 6), giving meaningful control without overriding the arc's momentum.

### BOOST (rapid-tap mid-air acceleration)

**Feel**: Escalating power. A turbo charging up. Each tap stacks energy.

This is the game's best input and it needs the best feedback. Full design in Section 6.

### LAND (surface contact)

**Feel**: Magnetic snap. A satisfying click into place.

Landing should feel like a puzzle piece dropping into its socket -- there's a brief resistance and then a definitive lock. The existing landing sound (60-90Hz sine sweep down to 30Hz + metallic ring at 1200-2000Hz) is the right structure. The metallic ring needs more harmonic complexity -- add a second partial at 1.7x the base frequency (inharmonic, like striking a bell) and route it through a short reverb (0.3s decay, currently the reverb is 2s which is too long for an impact).

The squash on landing needs to be more dramatic for hard landings. Currently `squash = max(0.7, 1 - abs(verticalSpeed) * 0.03)` -- at impact speed 10 this gives 0.7, which is correct but reaches it too gently. Add an impact squash multiplier: on the frame of landing, set squash to `max(0.5, 0.7 - impactSpeed * 0.02)` for one frame, then let the lerp smooth it back. This gives a visible "pancake" moment.

The landing pulse ring (existing: fast expand then slight contract) is excellent. For landings on a target airport, double the ring count (2 rings instead of 1) and color them to match the target ring tiers.

Camera: a single-frame downward pitch of 2-3 degrees that recovers over 200ms. Not random shake -- directional. The ground hit you.

**Reference**: Hollow Knight's landing. Every time the Knight drops from height, there's a dust burst, a thud, and a tiny camera settle. It makes stone floors feel like stone, not clouds.

### DELIVER (successful package drop-off)

**Feel**: Triumph. Slot machine jackpot. The world celebrates you.

Delivery is the payoff for the entire charge-launch-fly-land chain. It must be proportionally rewarding. The existing delivery chime (C5-E5-G5-C6 arpeggiated triangle+sine) is musically correct but too polite. It needs to be 40% louder relative to other SFX, with a 400ms reverb tail that makes it ring out over the next action. Add a bass hit underneath: a single cycle of 80Hz sine at gain 0.2, lasting 50ms. This is the "thump" that your chest feels.

For BULLSEYE deliveries, the chime should add a major 9th (D6) at the end of the arpeggio and shimmer with a chorus effect (2 detuned copies, +7 and -7 cents). This is the "perfect" sound -- the Extra Thing that only happens when you nail it.

Camera: zoom out 5% over 300ms then zoom back, framing the delivery rings. For BULLSEYE, add a 100ms time-slow (reduce deltaTime to 0.3x) so the player sees the perfect landing in slow motion. Celeste does this with its dash crystals. Peggle does this with Extreme Fever. The slow-mo says "you did something special."

Combo feedback text ("NICE!" / "GREAT!" / "PERFECT!") should pop in from below with a spring animation (overshoot by 20%, settle over 300ms). Font size scales with combo level. A combo of x5 should feel like the game is losing its mind.

**Reference**: Peggle. Every shot hits a peg and gets a chime. Clear all orange pegs and Beethoven's 9th plays while the screen explodes. The entire game's emotional design is "make the player feel like a genius." That's our target for BULLSEYE.

### OVERSHOOT (fly past destination)

**Feel**: Regret. The sinking stomach of a missed exit on the highway.

A descending two-note tone (existing: 400Hz->340Hz, 280Hz->220Hz square waves). This is good but the square wave is too harsh for "candy mood." Change to triangle wave for a gentler, sadder quality. Add a slight downward pitch bend (-50 cents) on each note to emphasize the "falling away" feeling.

Camera: no effect. The overshoot is its own punishment. Drawing attention to failure should be minimal -- the sound is enough. Heavy-handed failure feedback teaches players to stop taking risks, which kills the fun.

### TIMEOUT (package expires)

**Feel**: Deflation. Air leaving a balloon.

The existing expiry sound (sawtooth 200Hz->40Hz + noise crash) is appropriately dramatic. The countdown beeps before it (accelerating square waves) do their job. One refinement: the final 3 seconds should add a low-frequency oscillation (8Hz sine modulating the master gain by +/- 2dB) creating an audible "trembling" that signals imminent doom without requiring the player to watch the timer.

---

## 2. Audio Design Language

### Sonic Palette

Glo-ball Gopher's world is electromagnetic, not acoustic. Sound comes from magnetic fields, plasma interactions, and energy transfer, not from wood or metal or wind. This constrains our synthesis palette:

| Source | Technique | Role |
|--------|-----------|------|
| **Oscillators** (sine, triangle) | Subtractive synthesis | Tonal events: chimes, warnings, melody |
| **Sawtooth + bandpass** | Resonant filtering | Growls, engine sounds, charge building |
| **White noise + shaping** | Filtered noise | Wind, impacts, crackle, atmosphere |
| **FM synthesis** (mod osc -> carrier) | Frequency modulation | Metallic bells, crystalline pings, combo sounds |
| **Waveshaping/distortion** | `WaveShaperNode` with soft-clip curve | Dirty boost sounds, turbo overload |

**What we do NOT use**: sampled instruments (breaks the procedural identity), reverb tails longer than 1.5s (too "cathedral," we want electromagnetic shimmer), heavy distortion (grim, not candy).

All synthesis via Web Audio API. No audio file downloads. This keeps the game under 500KB and eliminates loading screens.

### Frequency Zones

To prevent frequency masking (sounds stepping on each other), assign each category a primary range:

| Category | Frequency Range | Why |
|----------|----------------|-----|
| Sub-bass (charge, landing thud) | 30-80Hz | Felt, not heard. Visceral weight. |
| Drone/ambience | 55-400Hz | Constant bed, never foreground |
| Bounce/launch transient | 400-2000Hz | Mid-range punch, cuts through |
| Chimes/delivery/combo | 500-2000Hz | Melodic, emotive |
| Warning beeps | 300-700Hz | Urgent but not painful |
| Wind/noise textures | 300-4000Hz | Wide, atmospheric |
| UI pings/clicks | 1200-3000Hz | Sharp, directional, brief |
| Sparkle/shimmer | 3000-8000Hz | Fairy dust, magic, reward |

### Reverb Design

Two reverb impulse responses, both procedurally generated:

1. **Short room** (0.3s decay): For impacts and transients. Adds body without smearing.
2. **Long shimmer** (1.2s decay): For delivery chimes and combo sounds. The "reward" space.

The existing 2s reverb is too long for a game running at 60fps with events happening every second. Shorten it. The shimmer reverb should have pre-delay (30ms) so the dry transient hits first, then the tail blooms.

### Complete Sound Map

| Event | Sound | Pitch | Duration | Envelope | Notes |
|-------|-------|-------|----------|----------|-------|
| Charge start | Saw pair 55Hz + noise rumble | Sub-bass | Sustained | Slow attack, opens with charge | Add 2-8Hz pulse |
| Charge tick (per 25%) | Click + rising ping | 600/800/1000/1200Hz | 30ms | Instant attack | Quantized feedback |
| Launch | Saw sweep 800->80Hz + click + noise | Mid | 250ms | Hard attack, fast decay | Add 1ms click transient |
| Bounce (ground contact, not launch) | Sine thud 60Hz + ring 1200Hz | Low+high | 200ms | Instant | Scale with impact |
| Fly (continuous) | Bandpass noise | 300-2300Hz | Sustained | Ramps with speed | Stereo responds to steer |
| Boost tap | Saw burst, rising per tap | 400-1000Hz | 120ms | Sharp attack | See Section 6 |
| Land (airport) | Sine 60->30Hz + bell 1200Hz | Low + high | 350ms | Thud + ring | Short reverb 0.3s |
| Land (non-airport) | Sine 40->25Hz | Sub-bass only | 150ms | Soft thud | Minimal |
| Deliver | Triangle arpeggio C5-E5-G5-C6 + bass hit | Major triad | 500ms | Staccato notes + tail | Long shimmer reverb |
| Deliver BULLSEYE | Above + D6 shimmer + chorus | Major 9th | 700ms | Extra sparkle | Louder, prouder |
| Combo increment | FM bell, pitch rises per level | 660 + level*110 Hz | 150ms | Ping | Gets brighter each level |
| Overshoot/miss | Triangle two-note descending | 400->280Hz | 300ms | Gentle fall | Not punishing |
| Timer warning | Square beep | 300-700Hz | 60ms | Staccato | Accelerating rate |
| Package expire | Saw sweep 200->40Hz + crash | Low | 800ms | Dramatic | Master gain tremor at end |
| Proximity ping | Sine 880Hz | A5 | 300ms | Soft attack, fade | When nearing target |
| Destination selected | Triangle chirp 660/990Hz | Rising fifth | 120ms | Quick double-note | Lock-on feel |
| Airport tapped | Sine sweep 1200->800Hz | Falling | 150ms | Sonar ping | UI feedback |
| Aim tick | Sine 1800Hz + random | High | 30ms | Click | Very subtle |

### Altitude-Dependent Soundscape

The existing `updateAltitude()` system fades drones and shifts filters based on height. Here is the complete design for all five altitude layers:

**Surface (0-5km / 0-0.05 gu altitude)**
- Full drone bed (55Hz root, harmonics at 82.5, 110, 165Hz)
- Pad layer warm, filter at 800Hz
- LFO slow (0.1Hz) -- leisurely pulse
- Wind layer silent (speed dependent, not altitude)
- *Emotional quality*: Safe. Home base. The hum of civilization.

**Low (5-50km / 0.05-0.5 gu)**
- Drone unchanged
- Wind layer active if moving
- Pad filter opens to 1200Hz -- brighter, more open
- *Emotional quality*: In motion. The journey begins.

**Mid (50-200km / 0.5-2.0 gu)**
- Drone volume -30% (multiply by 0.7)
- High harmonics (165Hz) drop further (-50%)
- Pad filter at 1800Hz but gain reduced 20%
- Wind layer present but thinner (reduce Q from 0.5 to 0.3)
- Add: subtle high-frequency shimmer (2 detuned sines at 2000Hz, gain 0.02, slow LFO on volume). This is the sound of the upper atmosphere ionizing.
- *Emotional quality*: Exposed. Thinning. Looking down at the curve of the Earth.

**High (200-500km / 2.0-5.0 gu)**
- Drone volume -70% (multiply by 0.3)
- Only root (55Hz) and octave (110Hz) remain
- Pad nearly inaudible (gain 0.02)
- Wind layer gain halved
- Shimmer layer louder, slower LFO (0.03Hz)
- Add: occasional single-note "ping" from the cosmic environment -- a random sine at 1500-3000Hz, gain 0.03, once every 5-15 seconds. Like hearing individual atoms hitting the hull. Sparse, alien, beautiful.
- *Emotional quality*: Awe. Isolation. The vast quiet of near-space.

**Space (500km+ / 5.0+ gu)**
- Drone at 15% (whisper of the root, nothing else)
- No wind layer
- Shimmer continues, very quiet
- Cosmic pings continue, slightly more frequent
- High-pass filter on master output: gradually roll off below 200Hz
- *Emotional quality*: Profound silence. The void. A single held breath.

---

## 3. Music System Design

### Genre and Identity

**Genre**: Chiptune-flavored synthwave. Bright, bouncy, rhythmic, slightly retro. Think Katamari Damacy meets Neon Drive meets the Animal Crossing soundtrack's warmth.

**Key**: C major or A minor depending on gameplay state. Major for cruising and delivering, minor for urgency and low-timer moments. Modulate between them fluidly.

**Tempo**: 110 BPM. Fast enough to feel energetic, slow enough that a 16th note (136ms) aligns well with rapid-tap boost timing. This is deliberate -- see Section 5.

**Instruments** (all synthesized):
1. **Bass**: Square wave + sine sub-octave, portamento slides between notes. The groove anchor.
2. **Lead**: Pulse wave (variable duty cycle 25-50%), detuned pair for thickness. Carries melody.
3. **Pad**: 4-voice saw ensemble, low-passed at 2000Hz. Harmonic bed.
4. **Arpeggio**: Triangle wave, 16th note arpeggiated chords. The "sparkle" layer.
5. **Percussion**: Noise-based kicks (sine 100Hz->30Hz, 80ms), hats (highpass noise, 40ms), snare (noise + sine 200Hz, 100ms). All synthesized.

### Layer Architecture

The music system uses 5 independently-controllable layers that crossfade based on game state:

| Layer | Content | Trigger On | Trigger Off |
|-------|---------|------------|-------------|
| **1. Pad Bed** | Sustained chord, C-E-G or Am-C-E | Always on | Never (fades in space) |
| **2. Bass Line** | 4-bar loop, root + fifth patterns | Player has a delivery | Delivery completed or expired |
| **3. Arpeggio** | 16th note broken chords | Speed > 5 OR altitude > 1.0 gu | Speed < 3 AND altitude < 0.5 |
| **4. Lead Melody** | 8-bar melody phrase | Combo >= x2 | Combo resets |
| **5. Urgency Pulse** | Rhythmic stabs, filter-swept noise | Timer < 30s | Timer >= 30s or delivery done |

**Chord Progression** (4 bars, repeating):
```
| Cmaj7 | Am7 | Fmaj7 | G7 |
```
Simple, bright, endlessly loopable. The pad plays whole notes. The bass walks quarter notes with octave jumps. The arpeggio plays broken chord tones in 16th notes. The lead plays a pentatonic melody over the top during combos.

When the timer drops below 30s, the progression shifts:
```
| Am7 | Dm7 | Em7 | E7 |
```
Same instruments, darker chords. The E7 (dominant of Am) creates pull and tension.

When the timer drops below 10s, the arpeggio layer doubles speed (32nd notes, effectively 220 BPM) and a filter sweep opens on the urgency layer, rising 200Hz->4000Hz over the final 10 seconds. This is the "Tetris panic" technique.

### Volume Scaling

- Music master volume: 0.12 (never louder than SFX)
- Individual layer gains: 0.03-0.08
- Altitude > 3.0 gu: music fades by 50%. Space should be quiet.
- Game over screen: all layers except pad fade. Pad sustains a single chord for 3 seconds, then arpeggio plays a final descending phrase (4 notes over 2 seconds). Closure.

### Emotional Arc of a 3-Minute Session

```
0:00  [START] Pad only. Gentle. "Here you are on a planet."
0:05  [FIRST DELIVERY CHOSEN] Bass enters. "Let's go."
0:15  [FIRST LAUNCH] Arpeggio fades in during flight. "You're moving!"
0:30  [FIRST DELIVERY] Chime + brief arpeggio flourish. "Yes!"
0:45  [SECOND DELIVERY] If combo active, lead melody enters. "You're on a roll."
1:00  [MID SESSION] Full layers if playing well. Musical peak.
1:30  [CRUISING] Layers respond to altitude and speed. Dynamic.
2:00  [TENSION] Arpeggio still active but player feels time pressure.
2:30  [URGENCY] Minor key shift. Urgency pulse enters. "Hurry."
2:45  [PANIC] Arpeggio doubles speed. Filter sweep rising. "NOW!"
3:00  [TIME UP] All layers except pad cut. Single sustained chord.
3:03  [FINAL SCORE] Descending arpeggio phrase. Rest.
```

### Implementation Note

Each layer is a separate oscillator/gain chain. No audio files. The "song" is a `setInterval` at 545ms (one beat at 110 BPM) that advances a step counter and adjusts oscillator frequencies per the chord progression. Layers are enabled/disabled by setting their gain nodes. Web Audio API's `setTargetAtTime` with a time constant of 0.3s creates smooth crossfades.

---

## 4. Screen Shake, Juice, and Visual Feedback

### Camera Effects Per Verb

| Verb | Camera Effect | Parameters | Duration |
|------|--------------|------------|----------|
| **Charge** | Tilt down 3-5 deg, FOV narrows 2-3 deg | `camera.rotation.x -= chargeProgress * 0.05` | Sustained |
| **Launch** | Snap back + overshoot, FOV punch +5-8 deg, 2-frame shake | Shake intensity 0.035, decay 0.85 | 200ms |
| **Fly** | Dynamic FOV (existing: +0.6 per speed unit, max +15) | Already implemented | Sustained |
| **Steer** | Roll 2-4 deg toward steer direction | `camera.rotation.z = steerX * 0.05` | Sustained |
| **Boost** | Micro-shake per tap (0.01 intensity), FOV pulse +3 deg | Decay 0.9 (faster reset) | 80ms |
| **Land** | Directional downward pitch 2-3 deg, settle over 200ms | Not random -- always "into ground" | 200ms |
| **Deliver** | Zoom out 5% over 300ms, zoom back | `camera.fov += 3`, then back | 600ms |
| **Deliver BULLSEYE** | Above + 100ms time-slow | `deltaTime *= 0.3` for 6 frames | 100ms |
| **Overshoot** | None | -- | -- |
| **Timeout** | Subtle zoom in 3% (claustrophobia) | `camera.fov -= 2` | 400ms |

### Particle Recommendations

Current particles: 80-particle delivery burst, EM pulse rings on bounce, landing pulse ring.

**Add**:

1. **Charge particles** (priority: HIGH): 8-12 small particles drawn inward toward the pod during charge. They start 2x pod radius away and spiral in, getting brighter. Additive blending, cyan color. On launch, they reverse direction and scatter outward. This makes charge *visible* even when the UI ring is off-screen.

2. **Boost exhaust** (priority: HIGH): On each boost tap, emit 6-10 particles backward (opposite velocity). Color shifts with tap count: cyan (tap 1), blue (tap 2), purple (tap 3), white-hot (tap 4+). Particles are stretched along velocity, lifetime 0.3s. This creates a "thruster" trail.

3. **Landing dust ring** (priority: MEDIUM): On hard landings (impact > 5), emit 20 particles radially along the surface tangent plane. Colored to match terrain (blue over ocean, tan over land). Opacity fades over 0.4s. This grounds the landing in the physical space.

4. **Combo sparkle** (priority: LOW): During active combo (x2+), emit 1-2 tiny sparkle particles per frame near the pod. Random colors from a candy palette (pink, cyan, gold). Slow rise away from planet surface. The pod is literally glowing with success.

### Squash & Stretch Refinement

The current system is solid. Refinements:

1. **Impact frame override**: On the frame of landing, bypass the lerp and set squash directly to `max(0.5, 1 - impactSpeed * 0.04)`. The lerp recovers naturally from this extreme pose. Currently the lerp (0.1 blend factor) softens everything too much -- hard landings should be *snappy*.

2. **Launch stretch**: On the frame of launch, set stretch Z to `min(1.8, 1 + chargeLevel * 0.5)`. The pod elongates dramatically in the launch direction for one frame, then the lerp relaxes it. This is the "stretch" half of the squash-stretch pair and currently it's too subtle.

3. **Anticipation squash**: During the last 20% of charge (progress > 0.8), pre-squash the pod slightly (0.9x Y scale). This "wind-up" tells the player the spring is fully compressed. Classic animation principle.

### Speed Lines and Motion Effects

The existing speed streaks (40 points, appearing above speed 5) are functional. Refinements:

1. **Radial vs. directional**: Currently streaks flow along velocity. At very high speeds (>12), switch some streaks to radial (away from a vanishing point ahead of the pod). This creates the hyperspace-tunnel effect that communicates extreme velocity.

2. **Chromatic aberration scaling**: The existing chromatic aberration post-process should scale with speed. At rest: 0 offset. At speed 10: 1px offset. At speed 20+: 2-3px offset. This is cheap and effective motion blur.

3. **Screen-edge speed vignette**: Darken the outer 15% of the screen proportionally to speed. At rest: no vignette. At speed 15+: visible darkening. This simulates peripheral vision compression during fast movement and naturally focuses attention on the center of the screen.

---

## 5. The Rhythm of Play

### The Bounce Cycle

A good session of Glo-ball Gopher has a rhythm:

```
REST ... CHARGE(build) ... SNAP(launch) ...
    soar ~~~~~ float ~~~~~ descend
... THUD(land) ... REST ... CHARGE ...
```

The cycle takes 8-15 seconds. At 110 BPM, that's 15-27 beats. This means:
- A charge lasts 1-4 beats (0.5-2 seconds)
- Flight lasts 10-20 beats (5.5-11 seconds)
- Landing + rest lasts 2-5 beats (1-2.7 seconds)

The music at 110 BPM naturally subdivides these phases into musical phrases. A 4-bar phrase (8 beats, 4.4 seconds) fits comfortably inside a flight arc. The player hears a complete musical idea during each arc.

### Sound Reinforcing Rhythm

The key insight: **the bounce IS a drum hit.** The launch snap is the kick drum. The landing thud is the snare. Mid-air flight is the sustained pad between beats. If we tune the launch and landing sounds to be rhythmically compatible with the music layer, the player's actions become part of the song.

Practically this means:
- Launch sound should have a strong attack and minimal tail (like a kick)
- Landing sound should have a sharp transient and a short resonant tail (like a snare with a splash)
- The gap between them (flight) should be filled by the wind layer and the arpeggio -- both continuous, both textural

This creates an emergent polyrhythm: the player is "drumming" their bounce pattern against the game's steady tempo. When a player bounces in time with the music (even accidentally), it feels magical. When they're off-beat, it still works because the launch and landing sounds are percussion, and percussion is forgiving of timing.

### Can Music Sync to Bounce Timing?

Full synchronization (quantizing bounces to the beat grid) would feel terrible -- it would add latency to a physics game. Instead, use **reactive tempo adjustment**:

1. Track the average time between bounces over the last 3 bounces.
2. If the average is within 15% of a musical subdivision (beat, half-beat, double-beat), nudge the music tempo 2-3% toward alignment.
3. Limit total tempo drift to +/-8% (102-119 BPM).

This means a player who bounces rhythmically will find the music subtly locking to their rhythm, creating a flow state without them understanding why. A player who bounces irregularly gets a steady 110 BPM that sounds composed rather than mechanical.

**Implementation**: A single variable `musicBPM` that lerps toward the nearest subdivision of the player's bounce interval. The step counter uses `60000 / musicBPM` for its interval.

---

## 6. The Boost Sequence

The rapid-tap boost is the game's signature moment. Currently it plays a rising sawtooth burst per tap and shows text labels (BOOST!, BOOST x2!, BOOST x3!, TURBO!). Here is the full design:

### Tap 1: IGNITION

- **Sound**: Sawtooth burst at 400Hz, swept up to 600Hz over 100ms. Bandpass filter centered at 800Hz, Q=3. Gain 0.1, decay over 120ms. Clean and punchy.
- **Visual**: Single EM pulse ring (existing). Speed streaks brighten 20%. Pod stretches 10% along velocity.
- **Camera**: Micro-shake 0.01 intensity. FOV pulse +2 degrees (50ms recovery).
- **Haptic**: 15ms vibration (existing).
- **Label**: "BOOST!" in cyan, 24px, fades over 800ms.

### Tap 2: ACCELERATION

- **Sound**: Sawtooth at 520Hz->780Hz. Same envelope but add a second oscillator at 1.5x frequency (parallel fifth) for harmonic richness. Gain 0.12. Filter Q increases to 4 (more resonant, more aggressive).
- **Visual**: Double EM pulse ring (2 rings, staggered 40ms). Speed streaks at 40% opacity. Boost exhaust particles (6 particles, cyan).
- **Camera**: Shake 0.015. FOV pulse +3 degrees.
- **Haptic**: 20ms vibration.
- **Label**: "BOOST x2!" in blue, 28px.

### Tap 3: OVERDRIVE

- **Sound**: Sawtooth at 640Hz->960Hz with a `WaveShaperNode` soft-clip distortion (subtle -- drive amount 0.3). Third oscillator at 2x frequency (octave). The sound is thicker, dirtier, more powerful. Gain 0.14. Add a noise burst layer (highpass at 4000Hz, gain 0.04, 60ms) for sizzle.
- **Visual**: Triple ring. Speed streaks at 60% opacity. Boost exhaust particles (8 particles, purple). Pod glow material emissive intensity temporarily doubles for 200ms.
- **Camera**: Shake 0.02. FOV pulse +4 degrees. Camera pulls back 0.1 units (widening the view to communicate speed).
- **Haptic**: 30ms vibration.
- **Label**: "BOOST x3!" in purple, 32px, slight scale pulse.

### Tap 4+: TURBO

- **Sound**: Full chord -- sawtooth at 800Hz, 1200Hz (fifth), and 1600Hz (octave) simultaneously. Heavy `WaveShaperNode` distortion (drive 0.6). Low sub-sine at 60Hz adds weight. White noise burst through a bandpass sweep (2000Hz->6000Hz over 150ms) creates a "whoosh." Total gain 0.18. Route through the shimmer reverb (1.2s). This should sound like a jet engine afterburner lit by a synthesizer.
- **Visual**: Quad ring burst. Speed streaks at full opacity, switch to radial mode (hyperspace effect). Boost exhaust particles (12 particles, white-hot). Pod glow triples. Screen-edge vignette pulses bright cyan for 100ms then fades. The chromatic aberration offset doubles for 200ms.
- **Camera**: Shake 0.025. FOV punches to +8 degrees (wider than launch!). Camera pulls back 0.15 units. 50ms time-slow (deltaTime * 0.5) to let the player see the TURBO moment register.
- **Haptic**: 50ms vibration pattern [20, 10, 20].
- **Label**: "TURBO!" in white with gold outline, 40px, spring-scale animation (1.0->1.3->1.0 over 300ms).
- **Music interaction**: If the lead melody layer is off, activate it for 4 bars. The TURBO earns music.

### Cooldown

After 1.5 seconds without a tap, the tap counter resets (existing: 800ms timeout). Extend to 1.5s to give the TURBO feeling time to breathe. During the cooldown, the boost exhaust particles trail off naturally (no hard cut).

The rising pitch across taps (400, 520, 640, 800 Hz) follows a pattern of ascending major thirds. This is the pitch language of triumph -- think of the NBC chime or the Intel bong. Each tap confirms "yes, and more."

---

## 7. Implementation Priority

What transforms "tech demo" into "game"? Ranked by impact-per-hour-of-development:

### Priority 1: Music Layer System (Impact: TRANSFORMATIVE)

**What**: The 5-layer adaptive music system described in Section 3. Even a simplified version (pad + bass + arpeggio, 3 layers) changes everything.

**Why**: The single biggest difference between "tech demo" and "game" is music. Ambient drones are texture; music is *emotion*. A player bouncing across the planet in silence feels like testing software. A player bouncing to a beat feels like *playing*. Katamari Damacy without its soundtrack is a tech demo about collision detection. Every game cited in this document (Celeste, Hollow Knight, Downwell, Peggle) is defined by its music.

**Web Audio cost**: 5-8 oscillators, 3 gain nodes, 1 setInterval. Minimal CPU. The chord progression is 4 arrays of frequency values. Total code: approximately 200 lines.

**Estimated time**: 3-4 hours for base system, 2 hours for state-reactive triggers.

### Priority 2: Launch Transient Click (Impact: HIGH)

**What**: Add a 1ms gain spike at the start of the bounce sound. A hard `setValueAtTime(0.3, t)` followed by `setValueAtTime(0.15, t + 0.001)`.

**Why**: This single millisecond of audio transforms a "whoosh" into a "SNAP." The entire charge-release cycle gains meaning because the release has a definitive sonic moment. Every player who has ever pressed a button in a good game has heard this click -- it's the subliminal confirmation that input was received. Without it, actions feel floaty and uncertain. Celeste's dash has a 1-sample click. Hollow Knight's nail swing has it. Downwell's gunboot has it.

**Web Audio cost**: One extra line of code.

**Estimated time**: 5 minutes.

### Priority 3: Charge Heartbeat Pulse (Impact: HIGH)

**What**: Amplitude-modulate the charge growl with a sine LFO starting at 2Hz, rising to 8Hz at full charge. `chargeGain.gain.setValueAtTime(baseGain + Math.sin(time * pulseRate) * pulseDepth, t)`.

**Why**: Without a pulse, the charge sound is a static drone. With a pulse, it becomes a countdown -- the player feels urgency increasing without reading any UI. It also creates a rhythmic anticipation that makes the release more satisfying (the release happens "between" pulses, breaking the pattern). This is why countdown timers beep faster: acceleration = urgency.

**Web Audio cost**: One LFO oscillator routed to the charge gain node's gain parameter.

**Estimated time**: 30 minutes.

### Priority 4: Boost Escalation Polish (Impact: HIGH)

**What**: Implement the full tap 1->2->3->TURBO sound design from Section 6: add harmonics per tap, distortion on tap 3+, chord on TURBO.

**Why**: The rapid-tap boost is already "the most fun input." Sound escalation turns "fun" into "thrilling." Each tap should feel more powerful than the last, and right now they sound like the same event at slightly different pitches. The harmonic stacking (single->fifth->octave->chord) creates an auditory narrative: building, building, building, RELEASE. This is the reward loop compressed into 2 seconds.

**Web Audio cost**: 3-4 additional oscillators per boost (temporary, self-cleaning). One `WaveShaperNode` shared across all boosts.

**Estimated time**: 2 hours.

### Priority 5: Camera Tilt During Charge (Impact: MEDIUM-HIGH)

**What**: During charge, tilt the camera down 3-5 degrees proportional to charge progress. On release, snap back with 1-degree overshoot settling over 150ms.

**Why**: This is the cheapest possible way to make charging feel *physical*. The camera moving is the player's "head" moving. Tilting into the planet during charge says "pressing down." Snapping back on release says "springing up." It transforms a button hold from a timer into a physical action. The overshoot on release is critical -- it's the whiplash that proves the spring was under tension.

**Implementation cost**: 3 lines in `updateCameraPosition()` -- a tilt offset derived from charge progress, and a decaying overshoot variable set on launch.

**Estimated time**: 45 minutes.

### Honorable Mentions (Priority 6-10)

6. **Delivery bass hit**: Add 80Hz sine thump under the delivery chime. 10 minutes. Makes deliveries feel weighty.
7. **Altitude shimmer layer**: 2 detuned sines at 2000Hz, gain modulated by slow LFO, active above 2.0 gu altitude. 30 minutes. Makes high altitude feel different.
8. **Landing squash override**: Bypass lerp on impact frame for dramatic pancake. 15 minutes. Makes landings snappy.
9. **Wind stereo panning**: Pan wind noise opposite to steer direction. 20 minutes. Creates spatial steering feedback.
10. **Combo text spring animation**: CSS `transform: scale()` with overshoot easing. 15 minutes. Makes combos feel celebratory.

---

## Appendix: Reference Games and Specific Takeaways

**Celeste** (Matt Thorson, 2018)
- 2-frame freeze on dash startup = commitment moment
- Dash sound has a hard click transient + tonal sweep
- Music layers add/remove per screen difficulty
- Takeaway: *Make the moment of commitment feel irreversible*

**Hollow Knight** (Team Cherry, 2017)
- Nail swing has a sharp attack + resonant ring (our landing metallic ring should emulate this)
- Footstep sounds change with surface material
- Ambient soundscape is unique per area
- Takeaway: *The environment should sound as detailed as it looks*

**Downwell** (Ojiro Fumoto, 2015)
- Gunboot has a satisfying "chunk" because it combines kick drum + jump + visual recoil
- Combo counter escalates visual chaos proportionally
- Only 3 colors. Constraints create clarity.
- Takeaway: *Audio feedback that combines with visual feedback is exponentially more satisfying than either alone*

**Peggle** (PopCap, 2007)
- Ode to Joy on final shot = the gold standard for "player feels like a genius"
- Slow-motion on final ball with reverb tail = the moment stretches
- Constant positive reinforcement (every peg chimes)
- Takeaway: *Never be stingy with celebration. The player wants to feel special.*

**Angry Birds** (Rovio, 2009)
- Slingshot pull = visible charge with elastic audio (stretching sound)
- Release = instant snap, no animation delay
- Impact sounds vary by material destroyed
- Takeaway: *The charge-release pair must feel like a single elastic action, not two separate events*

---

## Appendix: Web Audio API Constraints and Workarounds

1. **AudioContext resume**: Browsers require user gesture before audio plays. Already handled (click/touch/keydown resume). Music system must also check `ctx.state === 'running'` before scheduling notes.

2. **Oscillator reuse**: `OscillatorNode` cannot be restarted after `stop()`. Every sound event creates new oscillators. This is fine for transient sounds (bounce, chime) but the music system should keep its oscillators alive and change their frequency, not recreate them.

3. **Garbage collection**: Disconnected audio nodes are eventually GC'd but not immediately. For sounds that fire frequently (boost taps, aim ticks), reuse a pool of pre-created oscillator+gain pairs to avoid GC pressure. A pool of 8 "voice" chains recycled round-robin is sufficient.

4. **Timing precision**: `setValueAtTime` and `exponentialRampToValueAtTime` are sample-accurate. Use `ctx.currentTime` for scheduling, never `Date.now()` or `performance.now()`. The music step timer should use `setTimeout` for coarse timing but schedule note events ahead using `ctx.currentTime + lookahead` (lookahead = 100ms) to avoid jitter.

5. **Mobile performance**: Keep total simultaneous oscillator count under 20. The music system uses 5-8, ambience uses 4, wind uses 1, and transient sounds use 2-4 briefly. Budget is fine. Convolver (reverb) is the most expensive node -- limit to 2 simultaneous convolver instances, reuse them.

6. **iOS Safari quirk**: AudioContext on iOS has a maximum of 6 simultaneous `createMediaStreamSource` calls, but `createOscillator` is unlimited. Our all-synthesis approach sidesteps this limitation entirely.
