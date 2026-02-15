# Glo-ball Gopher -- Narrative Design Document

## Preface: The Rule of Suggesting

This document follows the *Journey* principle: **suggest everything, explain nothing.** Every narrative element proposed here must be implementable as behavior, visual cue, or short text string -- never as exposition, tutorial dialogue, or cutscene. If it can't be felt through play, it doesn't belong.

---

## 1. The World: What Happened Here?

### The Feeling, Not the Lore

The electromagnetic trampoline pads weren't always there. They weren't built by any government. One day -- nobody can quite say when -- they just *were*. Humming at the edges of runways, pulsing in colors that don't appear on the visible spectrum, anchored by forces no engineer claims credit for.

The world of Glo-ball Gopher is our world with a single crack in it. A hairline fracture in the ordinary. Everything looks right -- real airports, real continents, real aurora borealis shimmering over real poles -- but something is *also happening.* Something electromagnetic, something alive, something that makes the magnetic field lines glow a little brighter than textbooks say they should.

**The vibe:** Imagine waking up at 4am in an airport terminal and seeing, through the rain-streaked glass, a faint violet pulse rippling across the tarmac. Nobody else notices. You're not scared. You're curious.

That curiosity IS the narrative.

**Design implications:**
- The world never explains itself. No intro crawl, no narrator.
- The trampoline pads hum louder when the gopher approaches, as if they recognize it.
- The magnetic field visualization isn't decoration -- it's infrastructure. The pads tap into it.
- The aurora is slightly too vivid, slightly too far south. Something has amplified the magnetosphere.
- The ISS is still there, still orbiting, still human. A reminder that normal reality is watching.

### What Questions Should the Player Have?

After 5 minutes: "What am I delivering?"
After 20 minutes: "Why do these pads exist?"
After an hour: "Am I the only one doing this?"
After five sessions: "What happens when I deliver everything?"

The game should plant these questions. It should never answer them directly.

---

## 2. The Packages: What Are You Carrying?

The current eight package types (EM Coil, Flux Capacitor, Tesla Scroll, etc.) are evocative names but gameplay-identical. Each should feel different in your hands -- not just in points, but in how the delivery *plays*.

### 12 Package Types

Each package has: **name**, **flavor**, **gameplay modifier**, **base value**, **visual cue**, and **unlock condition**.

#### Tier 1 -- Available from Start

| # | Name | Flavor | Gameplay Effect | Value | Visual |
|---|------|--------|----------------|-------|--------|
| 1 | **EM Coil** | Standard transit. The bread and butter of the network. | None -- baseline delivery. Reliable, honest. | 100 | Blue glow |
| 2 | **Pulse Seed** | It vibrates faintly. Wants to be planted somewhere. | Must land within PRECISE ring or better -- outer ring counts as failure. | 150 | Green pulse |
| 3 | **Thermal Flask** | Warm to the touch. Doesn't like waiting. | Timer is 25% shorter. Time pressure intensifies. | 175 | Orange shimmer |

#### Tier 2 -- Unlock at Level 3+

| # | Name | Flavor | Gameplay Effect | Value | Visual |
|---|------|--------|----------------|-------|--------|
| 4 | **Drift Glass** | Light bends around it. Handle with grace. | Landing impact must be gentle: bonus only if final descent speed is below threshold. Encourages short final hops. | 250 | Prismatic refraction |
| 5 | **Leaden Hymn** | Heavier than it looks. Much heavier. | Bounce force reduced by 20%. Arcs are lower, flatter. Requires recalibrating muscle memory. | 225 | Dark violet, dense |
| 6 | **Compass Rose** | Always pointing somewhere. Not north. | Steering is inverted on the horizontal axis. The package has its own opinion about direction. | 275 | Spinning needle particle |

#### Tier 3 -- Unlock at Level 6+

| # | Name | Flavor | Gameplay Effect | Value | Visual |
|---|------|--------|----------------|-------|--------|
| 7 | **Stardust Vial** | It sheds light that shouldn't exist yet. | Trail behind the gopher is amplified and lingers 3x longer. Purely cosmetic reward for skilled players -- but marks your path on the globe like a comet. High base value. | 400 | Brilliant white trail |
| 8 | **Echo Chamber** | You hear your last three bounces replayed inside it. | Every third bounce triggers a "resonance burst" giving +30% force. Rewards rhythmic play. | 350 | Reverberating rings |
| 9 | **Void Envelope** | Sealed. Do not open. Do not think about opening. | HUD destination arrow is disabled. Player must navigate by geography, constellations, and memory alone. The ultimate skill test. | 500 | Black with faint stars |

#### Tier 4 -- Unlock at Level 9+

| # | Name | Flavor | Gameplay Effect | Value | Visual |
|---|------|--------|----------------|-------|--------|
| 10 | **Aurora Thread** | Pulled from the curtain itself. It hums at 7.83 Hz. | Can only be delivered while passing through high altitude (>100km). Must arc through the aurora band. Destination ring only activates when descending FROM above. | 450 | Aurora-colored wisp |
| 11 | **The First Letter** | Addressed to someone. The ink hasn't dried. | Combo multiplier starts at x2 instead of x1, but resets entirely on any accuracy below PRECISE. High risk, high reward. | 500 | Warm amber glow |
| 12 | **Dream Fragment** | It changes when you're not looking at it. | Every hop of the delivery assigns a DIFFERENT destination airport within the same route graph region. The final destination shifts. Player must adapt. | 600 | Shifting iridescent |

### Implementation Notes

All modifiers are numeric tweaks to existing systems:
- Timer multiplier (Thermal Flask): `timeLimit *= 0.75`
- Force multiplier (Leaden Hymn): `bounceForce *= 0.8`
- Precision threshold (Pulse Seed): check accuracy tier >= PRECISE
- Speed threshold (Drift Glass): check `velocity.length() < threshold` at landing
- Steering inversion (Compass Rose): `steerInput.x *= -1`
- Trail duration (Stardust Vial): `trailLifetime *= 3`
- Resonance counter (Echo Chamber): increment on bounce, fire bonus every 3rd
- HUD suppression (Void Envelope): hide direction arrow and distance readout
- Altitude gate (Aurora Thread): check altitude at ring entry
- Combo seed (The First Letter): `comboCount = Math.max(comboCount, 1)` at pickup
- Destination shift (Dream Fragment): re-roll among connected airports each hop

All stored in localStorage via the existing `GameState.unlockedPackageTypes` array.

---

## 3. The Courier: Personality Through Behavior

The gopher has no voice. It speaks through motion, particle effects, and micro-animations. Every reaction should be readable at a glance and never interrupt gameplay.

### Emotional State System

The gopher's visual state reflects recent performance. Tracked as a simple mood float from 0.0 (dejected) to 1.0 (ecstatic), nudged by events:

| Event | Mood Shift | Visible Behavior |
|-------|-----------|-----------------|
| BULLSEYE landing | +0.3 | Wings flutter rapidly, eyes squeeze shut (happy squint), brief golden particle burst from body. Spin in place once. |
| PRECISE landing | +0.15 | Wings do a single proud flap. Eyes widen briefly. |
| DELIVERED (outer ring) | +0.05 | Slight nod. Adequate. |
| Combo x3 | +0.1 | Gopher glows brighter. Hum pitch rises. Cargo pod orbits faster. |
| Combo x5 | +0.2 | Full-body prismatic shimmer. Wings spread wide. A visible "pulse ring" expands outward like a sonic boom. |
| Overshoot | -0.1 | Wings fold tight. Eyes go wide (startled). Brief tumble animation before re-stabilizing. |
| Package expired | -0.2 | Slump. Wings droop. Eyes half-close. Glow dims noticeably for 3 seconds. |
| Stuck (no movement >5s) | -0.05/s | Gopher looks around nervously. Eyes dart. After 10s: small frustrated hop. After 20s: comedic sleeping animation (eyes closed, tiny Zs). |
| Chain launch (<3s) | +0.05 | Eager crouch before launch, like a cat about to pounce. |

### Idle Behaviors (When Parked)

- **Default**: Faces camera, blinks occasionally, cargo pod bobs gently.
- **Happy mood (>0.7)**: Bounces very slightly in place. Wings occasionally stretch.
- **Sad mood (<0.3)**: Sits lower. Wings tucked. Blink rate increases (nervous).
- **At a new airport**: Looks around (brief head rotation) before facing camera. Curiosity.
- **After long session (>15 deliveries)**: Occasionally yawns (eyes squeeze, mouth widens). Tiredness.

### Sound Personality

- **Happy bounce**: higher pitch on launch chirp
- **Struggling**: lower, more effortful launch sound
- **Bullseye**: bright two-note ascending chime (the gopher's "victory call")
- **Overshoot**: descending whomp (the gopher's "oh no")
- **Combo x5**: layered harmonic chord, like the gopher is singing

All achievable through Web Audio API pitch/filter adjustments on existing sound cues.

---

## 4. The Airports as Characters

Twenty airports. Twenty personalities. No dialogue needed -- just consistent behavioral theming that makes each hub feel like a place.

### Airport Personality Matrix

Each airport has: **nickname** (shown subtly), **pad color tint**, **ambient sound hint**, and **preferred package types** (weighted offering).

| IATA | City | Nickname | Pad Tint | Sound Hint | Personality |
|------|------|----------|----------|------------|-------------|
| JFK | New York | The Gridlock | Amber-yellow | Distant horn honks | Impatient. Offers more Thermal Flasks (urgent). Short timers. Tips well. |
| LAX | Los Angeles | Sunset Strip | Warm pink | Low hum, surf-like | Laid back. Offers Stardust Vials. Generous timers. Lower base values. |
| LHR | London | The Old Gate | Cool grey-blue | Rain patter | Formal. Offers Drift Glass (precision). Average everything. Reliable. |
| CDG | Paris | Lumiere | Soft gold | Accordion wisp | Romantic. Offers Dream Fragments. Destinations tend toward distant, beautiful cities. |
| NRT | Tokyo | The Lattice | Clean white-blue | Shinkansen chime | Efficient. Combo bonuses +10% here. Offers Echo Chambers. |
| SYD | Sydney | Southpaw | Warm coral | Kookaburra trill | Friendly. Extra chain launch window (4s instead of 3). Offers EM Coils (simple, warm). |
| DXB | Dubai | The Mirage | Rich gold | Wind across sand | Extravagant. All package values +15% from here. Offers First Letters. |
| SIN | Singapore | Crossroads | Jade green | Tropical rain | Central. Connects to everything. Offers Compass Roses (many directions to choose). |
| HKG | Hong Kong | Neon Harbor | Magenta-pink | Harbor bell | Dense. Offers Leaden Hymns. High skill, high reward. Short distances, tight precision. |
| FRA | Frankfurt | The Hub | Steel blue | Train announcement tone | Methodical. Excellent routing connections. Offers Void Envelopes (trust the system). |
| AMS | Amsterdam | The Windmill | Deep orange | Wind gusts | Creative. Package selection is always unusual -- weighted toward Tier 3+. |
| ICN | Seoul | Fast Lane | Electric cyan | K-pop bass pulse | Competitive. Offers The First Letter. Combo timers extended by 2s here. |
| PEK | Beijing | The Great Circle | Imperial red | Deep gong | Grand. Long-distance deliveries weighted. Offers Aurora Threads. |
| GRU | Sao Paulo | Carnival Gate | Tropical green-gold | Samba shaker | Energetic. Chain launch bonuses doubled. Offers Pulse Seeds. |
| DEL | Delhi | The Crosswind | Saffron | Sitar drone | Unpredictable. Wind effects (slight random steering drift) while launching from here. Offers Compass Roses. |
| BOM | Mumbai | Monsoon Pad | Deep blue | Thunder rumble | Intense. Bounce force +10% but landing precision tightened. Offers Echo Chambers. |
| YYZ | Toronto | The Maple | Warm red | Hockey buzzer (faint) | Steady. No quirks. Reliable routes, reliable timers. The "home base" feeling. |
| MEX | Mexico City | La Altura | Terracotta | Marimba note | High altitude launch bonus (starts higher due to elevation). Offers Thermal Flasks. |
| CPT | Cape Town | The Cape | Ocean teal | Whale song | Remote. Long routes to everywhere. Offers Void Envelopes. Southern isolation. |
| SVO | Moscow | The Cold Coil | Ice white | Blizzard whisper | Harsh. Timers 10% shorter. Bounce force slightly higher. Offers Leaden Hymns. |

### Implementation

Airport personality is a data object per IATA code:
```javascript
const AIRPORT_PERSONALITY = {
  JFK: { nickname: 'The Gridlock', tint: 0xFFAA33, timerMod: 0.85, packageWeight: { thermal_flask: 3 } },
  // ...
};
```
- `tint`: Multiplied into trampoline pad emissive color
- `timerMod`: Multiplied into package timer
- `packageWeight`: Weighted random selection from available packages
- Nickname: Shown once, briefly, on first arrival at a given airport in a session -- then remembered

This is roughly 40 lines of config data. No new systems required.

---

## 5. The Rival Couriers

The original vision includes interception. In a single-player browser game with no server, rivals must be procedural ghosts -- convincing enough to create tension, simple enough to run on a single thread.

### Three Rivals, Three Philosophies

| Name | Glow Color | Behavior | Personality |
|------|-----------|----------|-------------|
| **Zephyr** | Pale blue | Fast, sloppy. Takes long arcs, frequently overshoots. Prioritizes speed over accuracy. | The reckless one. Seeing Zephyr overshoot a delivery you're also targeting feels *good*. Seeing it nail a bullseye at Mach 3 feels humbling. |
| **Lumen** | Warm gold | Precise, slow. Low arcs, always lands within PRECISE ring. Takes safe routes. | The perfectionist. Never misses, but can be beaten on time. A rival you respect. |
| **Flicker** | Shifting violet | Chaotic. Takes bizarre routes. Sometimes appears where you don't expect. Occasionally "steals" a package mid-delivery. | The wild card. The one that makes you say "where did THAT come from?" Not malicious -- just unpredictable. |

### Ghost Courier System

Rivals are pre-computed paths, not real-time AI:

1. When a delivery is offered, there's a 30% chance a rival is "also targeting" the same destination.
2. A ghost courier appears as a small glowing orb (no full gopher model needed) following a pre-baked great-circle arc toward the destination.
3. If the ghost arrives first (based on distance/time calculation), the delivery bonus is halved -- the rival "got there first."
4. If the player arrives first, bonus text: "Beat Zephyr!" (+50 bonus points).
5. Occasionally (10% chance), a ghost courier is visible in the distance heading to a DIFFERENT destination -- world-building, suggesting a busy courier network.

### The Interception Mechanic

When a ghost courier is visible and carrying a package (indicated by a small cargo glow), the player can attempt interception:

- Fly within 0.5 game units of a ghost courier mid-flight
- If successful: steal the package, get offered a bonus delivery to the ghost's destination
- Interception is optional, risky (takes you off your own route), and rewarding

### No Multiplayer Required

All rival data is generated from seeded random using the session timestamp. This means:
- Same session seed = same rival behavior (replayable)
- Rivals feel consistent within a session
- No server, no sync, just `Math.sin(seed * primeN)` driving path selection

---

## 6. Environmental Storytelling: What the Player Learns by Playing

### Layer 1 -- Geography (Sessions 1-3)

The player learns Earth. Not from a textbook -- from need. You NEED to know that Tokyo is east of Singapore. You NEED to know that Cape Town is isolated. You NEED to recognize the shape of Europe to navigate from Frankfurt to London. The electromagnetic trampoline network is the world's most engaging geography lesson.

**Implementation**: Already exists. The Blue Marble texture, airport positions, and hop-by-hop routing naturally teach geography. Constellations teach cardinal directions.

### Layer 2 -- The Network (Sessions 3-10)

Patterns emerge. Some airports are hubs with six connections. Some are spokes with two. The player starts to feel the *graph* -- the invisible infrastructure. Dubai connects East to West. Singapore connects North to South. Frankfurt is the spider at the center of Europe.

**Implementation**: Reinforce through the Ship's Computer NAV tab. Show connection counts. Let players see the graph topology. The "Crossroads" nickname for Singapore isn't just flavor -- it's a gameplay truth.

### Layer 3 -- The Packages (Sessions 5-15)

What ARE these things? The player has now delivered dozens of Pulse Seeds and Void Envelopes. Are the Pulse Seeds growing something at the destination? Are the Dream Fragments someone's actual dreams? Is the "First Letter" part of a correspondence? The game never says. But the names accumulate into a mythology.

**Implementation**: After 10 deliveries, the Game Over screen shows a "Manifest" -- a list of everything you delivered this session. Just names and destinations. Reading it back feels like reading a poem you accidentally wrote:

> Pulse Seed to Sao Paulo. Void Envelope to Cape Town. Dream Fragment to Paris. The First Letter to Seoul.

### Layer 4 -- The Gopher (Sessions 10+)

Who sent you? Why do the pads recognize you? Why does the gopher glow brighter with each combo? Is the gopher part of the network, or just using it? The gopher's increasing mood state and visual evolution across sessions (see Meta-Narrative) gradually suggests: this creature is becoming something. Growing. Resonating with the field.

**Implementation**: Subtle glow intensity increase tied to lifetime deliveries (stored in localStorage). Session 1 gopher: dim. Session 50 gopher: blazing. Never explained.

---

## 7. The Emotional Palette

A mapped emotional arc for a typical 3-minute session:

```
TIME        EMOTION         NARRATIVE SUPPORT
0:00-0:15   Wonder          Globe spins. Aurora glimmers. Pads hum. Music fades in.
0:15-0:30   Choice          Three packages offered. Names intrigue. "Void Envelope to Cape Town?"
0:30-1:00   Focus           Hop navigation. Geography brain engages. Routing decisions.
1:00-1:30   Momentum        First delivery lands. Combo starts. Gopher perks up.
1:30-2:15   Flow            Chain launches. Combo multiplier climbing. Ghost rival visible.
2:15-2:40   Tension         Timer running down. Current delivery is long. Rival is close.
2:40-2:55   Climax          Final approach. Rings visible. Landing...
2:55-3:00   Resolution      BULLSEYE. Or not. Score tallies. Manifest appears.
3:00+       Reflection      Session summary. What did you carry? Where did you go?
```

### How Narrative Supports Each Phase

- **Wonder**: The world should look slightly impossible. Too vivid. The aurora too close. This is handled by existing visuals -- no change needed.
- **Choice**: Package names and airport nicknames create micro-stories. "Delivering a Dream Fragment from Lumiere to The Lattice" is already a sentence that sparks imagination.
- **Focus**: The hop-by-hop graph routing creates a puzzle that requires real-world geographic knowledge. This is narrative through mechanics.
- **Momentum**: The gopher's increasing glow and mood animations reinforce success. The courier network feels responsive.
- **Tension**: Ghost rivals create social pressure without actual multiplayer. Timer creates urgency. Package modifiers create constraint.
- **Climax**: The concentric rings are the game's most narrative moment -- they're a target, a goal, a question ("will I make it?").
- **Reflection**: The manifest transforms a score screen into a story. "You delivered 7 packages across 4 continents."

---

## 8. Names Matter: Warmth Without Clutter

### The Problem

IATA codes are authentic but alienating. "LHR" means nothing to most people. "London Heathrow" is informative but long. The game needs to feel both real and warm.

### The Solution: Layered Naming

**Level 1 -- HUD (always visible):** IATA code + city name. Short, functional.
`LHR London` / `NRT Tokyo`

**Level 2 -- First arrival (shown once per session):** Nickname fades in below the IATA code for 3 seconds, then dissolves. This is the airport introducing itself.
`LHR London`
`~ The Old Gate ~`

**Level 3 -- Manifest (session end):** Full poetic line.
`Drift Glass delivered to The Old Gate, London`

**Level 4 -- Ship's Computer NAV tab:** Nickname shown next to IATA in the route list. Players who use the NAV tab are already engaging deeper.

### Package Naming Convention

Names should follow a pattern: **[Adjective/Material] + [Noun]**. They should sound like they belong in the same universe. Current names mostly do this well; the design above extends the pattern. Avoid:
- Generic sci-fi (Quantum, Nano, Hyper)
- Anything that sounds military
- Anything that needs explanation

Good: Drift Glass, Pulse Seed, Leaden Hymn, Aurora Thread, Void Envelope.
These sound like objects from a world just left of ours. They invite questions without demanding answers.

---

## 9. The Meta-Narrative: Across Many Sessions

### Courier Rank Evolution

The existing rank system (Trainee through Legendary) is functional but cold. Attach narrative texture:

| Rank | Title | Unlock Text (shown once) |
|------|-------|-------------------------|
| 0 | Trainee Courier | "The pads are listening." |
| 500 | Novice Courier | "You're starting to hum at their frequency." |
| 2,000 | Skilled Courier | "The network recognizes you now." |
| 5,000 | Expert Courier | "Zephyr nods as you pass." |
| 10,000 | Legendary Courier | "The field remembers every arc you've drawn." |
| 25,000 | Resonant Courier | "You're not just using the network anymore." |

### The Glow Chronicle (localStorage)

Track cumulative stats and surface them as narrative fragments -- not achievements, but *observations*:

- After 50 total deliveries: "The cargo pod has started humming on its own."
- After visiting all 20 airports: "Every pad on the network has felt your frequency."
- After 10 bullseyes in a single session: "The rings barely had time to spin."
- After first interception: "Flicker didn't seem to mind."
- After delivering all 12 package types: "You've carried things that don't have names in any language."
- After 100 sessions: "How long have you been doing this? The aurora seems to follow you now."

These appear as single-line messages on the session start screen, one per session, in sequence. They're stored as an array of milestone flags in localStorage. Each plays once, then is marked as seen.

### The Long Mystery

Across many sessions, the unlock texts and milestone observations sketch a very faint arc:

1. **You're new here.** The pads tolerate you.
2. **You're learning.** The pads respond to you.
3. **You belong.** The network knows you.
4. **You're changing.** The glow is part of you now.
5. **You ARE the network.** The final implication, never stated directly.

The gopher isn't just a courier. It's becoming part of the electromagnetic infrastructure of Earth. The packages aren't cargo -- they're nodes in a living system, and the gopher is the current flowing between them.

This is never said. It's felt.

### Practical Implementation

```javascript
const MILESTONES = [
  { key: 'first_delivery', check: s => s.totalDeliveries >= 1, text: "The pads are listening." },
  { key: 'fifty_deliveries', check: s => s.totalDeliveries >= 50, text: "The cargo pod hums on its own now." },
  { key: 'all_airports', check: s => s.visitedAirports.size >= 20, text: "Every pad has felt your frequency." },
  // ...
];
// On session start: find first unseen milestone where check() passes, display it, mark seen.
```

Total localStorage addition: one JSON array of seen milestone keys. Roughly 200 bytes.

---

## 10. The Tone Test: Five Flavor Texts

These are the voice of the game. If these feel right, the narrative design is on target.

---

**1.** *On the session start screen, before the first delivery:*

> The trampolines are warm tonight. Somewhere between Seoul and Singapore, a Pulse Seed is waiting to be planted. You can feel it from here.

---

**2.** *On the manifest screen, after a high-scoring session:*

> 9 packages. 4 continents. One Void Envelope delivered blind to Cape Town. The southern pad flickered twice when you landed -- almost like applause.

---

**3.** *As a milestone observation, after visiting all 20 airports:*

> You've touched every pad on the network now. If you listen carefully, you can hear them all at once -- a chord made of cities.

---

**4.** *On the first overshoot of a session:*

> Too much. The arc carried you past Tokyo and out toward the Pacific. The gopher's wings folded in -- not from physics, from embarrassment.

---

**5.** *On achieving Resonant Courier rank:*

> The field remembers every arc you've ever drawn. They crisscross the globe now, invisible to everyone but you and the pads. You're not delivering packages anymore. You're completing circuits.

---

## Appendix: Implementation Priority

All narrative features ranked by effort vs. impact:

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Package gameplay modifiers (12 types) | Medium -- numeric tweaks to existing systems | High -- transforms every delivery |
| 2 | Airport personality data (20 entries) | Low -- one config object | Medium -- makes hubs feel alive |
| 3 | Gopher mood system (float + visual tweaks) | Medium -- new state + animation hooks | High -- character without dialogue |
| 4 | Milestone observations (localStorage) | Low -- array of flags + text | Medium -- long-term meaning |
| 5 | Session manifest (end screen) | Low -- list from delivery log | Medium -- narrative reflection |
| 6 | Airport nicknames (layered display) | Low -- data + timed fade | Low-Medium -- warmth |
| 7 | Ghost rival couriers | High -- pathfinding, rendering, interception logic | High -- tension + world-building |
| 8 | Rank narrative text | Trivial -- string swap | Low -- polish |
| 9 | Flavor text on start/end screens | Trivial -- random selection | Low -- tone-setting |

**Start with packages and mood. End with rivals. Everything in between is flavor that costs almost nothing.**

---

*This document is a compass, not a map. The best narrative in Glo-ball Gopher will be the one the player writes in their own head, bouncing between cities they're learning to love, carrying things they'll never fully understand, glowing a little brighter each time they land.*
