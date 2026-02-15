# Devil's Advocate: Glo-ball Gopher

*A brutally honest critique by someone who wants this game to be good.*

---

## 1. The Uncomfortable Truth

Here is what a player actually experiences right now:

You load a webpage. A globe appears. It is gorgeous. There is bloom, there are stars, there are constellations with correct RA/Dec positions, there are Lagrange point markers, there is an aurora, there are magnetic field lines, there is a moon at its astronomically correct position, there are 80 deep field galaxies, there are 3 nebulae. The Earth has country outlines and city lights and atmospheric scattering.

Then you tap the screen.

A glowing ball launches into the air. You have no idea where you are. You have no idea where you are going. An arrow points somewhere. Numbers appear. You fly through space over a marble that could be any planet. You land somewhere. A score increments. You are asked to choose another delivery. You pick one. You have no idea what distinguishes the three options except a number. You tap again. You fly again. You land again. Three minutes pass. The session ends.

At no point did you feel like you were in Glasgow. At no point did you feel like you were delivering anything. At no point did you make a decision that felt meaningful. At no point were you challenged in a way you understood. You were a particle in a physics simulation with a beautiful skybox.

The user's verdict -- "more experience than game" -- is generous. It is more accurately described as a tech demo with a score counter bolted on.

The core problem is not that any single feature is broken. The core problem is that the game has no *legibility*. A player cannot answer three basic questions at any moment: Where am I? Where am I going? What should I do differently next time? Until all three of those questions have instant, visceral answers, nothing else matters.

---

## 2. Feature Creep Autopsy

Here is a complete inventory of features that exist in the codebase but do not serve gameplay. Each one cost development time, costs runtime performance, and adds cognitive load.

**DELETE (not hide -- delete):**

- **Constellation stick figures** (7 constellations, 116 lines of code in SpaceEnvironment.js). No player has ever oriented themselves by thinking "I'm heading toward Orion." This is a planetarium feature, not a game feature.

- **Deep field galaxies** (80 point sprites + 3 nebula sprites with procedural canvas textures, 134 lines). These are invisible during gameplay. They exist to impress a code reviewer, not a player.

- **Distant galaxy sprites** (`createDistantGalaxies()`, 73 more lines, 5 additional 256x256 canvas textures generated at startup). These are a *second* implementation of the same decorative concept. The codebase literally has two different galaxy systems.

- **Lagrange point markers** (5 octahedron markers with glow sprites and labels, 60 lines in SpaceEnvironment.js + rendering in ShipsComputer.js). Earth-Moon L4 is 384,000 km from Earth. The player bounces at 50km altitude. These are not gameplay-relevant. They are not even visible during normal play.

- **Magnetic field dipole lines** (referenced in CLAUDE.md as working). An 11-degree tilt from geographic north, two L-shell levels. Scientifically accurate. Completely irrelevant to bouncing between airports.

- **Ship's Computer ORBIT tab** (186 lines of 2D canvas rendering showing Earth-Moon system, Lagrange points, ISS orbit, sun direction indicator, moon phase, scale bar). This is a miniature Kerbal Space Program HUD for a game about bouncing between Heathrow and Narita. No player will ever use this. It draws the ISS orbit as a dashed circle. It shows moon phase labels like "Waxing Gibbous." It has a 100,000 km scale bar. The gameplay takes place within 200km of the surface.

- **OrbitalMechanics system** (243 lines, imports astronomy-engine library). Computes real sun, moon, and Lagrange point positions using the `astronomy-engine` npm package. The game is set in June 2045. It supports time warp up to 100,000x. None of this affects gameplay. The sun direction could be a static vector. The moon could be a static sphere.

- **Time warp controls** in Ship's Computer (date/time editing, warp speed selector up to 100,000x). For what? What gameplay scenario requires advancing the in-game clock by 100,000x? This is a feature for a space simulation game that does not exist.

- **5 orbiting satellites** (`createSatellites()`, each with body + solar panels + antenna). Decorative objects at orbits far above gameplay altitude. Nobody sees these.

- **Lat/lon grid** (30-degree spacing, highlighted equator/meridian). The player is a bouncing ball. Grid lines on the planet surface do not help them land on an airport.

**QUESTIONABLE (keep only if they serve a redesigned core loop):**

- **ISS model** (body + solar panels + 3 modules, positioned by real orbital mechanics). Could be a gameplay element if the game ever extends to orbital altitude. Right now it is a decoration.

- **City lights system** (298 lines). Atmospheric, but contributes to the visual noise that makes the game disorienting.

- **Aurora borealis** (227 lines + 245-line shader). Beautiful. Does not help you land on an airport.

- **Ship's Computer NAV tab**. This one is close to useful -- it shows airports on a 2D map. But it pauses gameplay awareness. If the graph-routing mechanic gets built, a simplified version of this could be the route-planning interface. The day/night terminator, the velocity vector, the coordinate readout -- trim all of that.

**Total code in features that do not serve gameplay:** Conservatively 1,800+ lines. That is 22% of the codebase dedicated to impressing nobody who is actually playing.

---

## 3. The AI-Built Game Problem

This codebase has every hallmark of AI-assisted development without editorial oversight:

**Feature accumulation without subtraction.** Each session with an AI assistant produces output. That output is almost always additive. "Add constellations." Done. "Add deep field galaxies." Done. "Add Lagrange points." Done. Nobody ever said "remove constellations" because removal feels like losing progress. The result is a codebase where `SpaceEnvironment.js` is 796 lines -- longer than the game state system, longer than the trampoline network, longer than the package delivery system. The sky has more engineering than the game.

**Specification-driven rather than feel-driven.** The vision document reads like a technical specification: "Real constellation stick-figures at correct RA/Dec sky positions." "Magnetic field dipole lines tilted 11 degrees from geographic axis, L=2.5 inner, L=4.0 outer." "astronomy-engine library for real-time sun/moon positions." These are specs you write when you are building a planetarium app. Nobody playtesting a bounce game said "the magnetic field tilt should be 11 degrees." An AI was told to make the sky realistic, and it did exactly that -- with scientific rigor and zero game design judgment.

**Debugging as development.** The CLAUDE.md "Confirmed Bugs & Fixes" section is a catalogue of rendering pipeline struggles: logarithmic depth buffers, Fresnel shader space conversions, alpha blending modes, sprite depth writes. These are real problems that needed solving, but they are infrastructure problems. The game spent sessions debugging why the planet was translucent when it should have been spending sessions on why the gameplay is opaque.

**Documentation as substitute for design.** There are six documentation files: VISION.md, GAMEPLAY.md, ARCHITECTURE.md, BACKLOG.md, two external reviews, plus CLAUDE.md itself. The documentation is thorough, well-organized, and professional. The game loop is still broken. Writing about what the game should be is not the same as making the game be that.

**The "working features" list is a red flag.** The CLAUDE.md "What's Working" section lists 25 bullet points. Most game jams ship with 5. The list includes "Lat/lon grid (30-degree spacing, equator/meridian highlighted)" and "Magnetic field dipole lines (11-degree tilt, L=2.5 + L=4.0 shells)" alongside "Package delivery with accuracy scoring." These are not the same category of feature. One is a game. The others are decorations. Listing them together as equals reveals a project that cannot distinguish between the two.

---

## 4. The Scope Trap

The backlog and vision documents contain these planned features:

- Graph routing with hop-by-hop navigation and radial dialogs
- Altitude as a gameplay mechanic (higher = faster but harder to land)
- Interception mechanic (intercept rival couriers)
- OpenStreetMap integration for street-level detail
- Regional delivery chains with bonuses
- Long-distance precision bonuses
- Difficulty curve tuning
- Combo/streak feedback with floating text
- Music layers
- Camera tilt during charge
- Pre-launch overshoot warning
- Mobile UX (safe areas, tap targets, accessibility)

This is the feature list of a game with a 3-person team and 6 months of development time. This game is built by one person prompting AI assistants on evenings and weekends.

**Permanently abandon:**

- **OpenStreetMap integration.** Loading, parsing, and rendering OSM tile data in a WebGL globe renderer is a multi-month project on its own. It will not happen. It should not happen. Street-level detail is irrelevant to a game where the player is 50km above the ground.

- **Interception mechanic.** This requires AI opponents, pathfinding on a sphere, collision detection between moving objects on ballistic trajectories, and a complete redesign of the single-player scoring loop. It is a different game.

- **Music layers.** The AudioSystem.js is already 770 lines of procedural audio generation. Adding dynamic music that responds to gameplay state is another 500+ lines minimum. Use a royalty-free loop. Move on.

- **100,000x time warp.** This is not a space simulation.

**Do if time allows, after the core is working:**

- Altitude as mechanic (this is actually important -- it adds risk/reward)
- Combo/streak feedback (cheap to implement, high feel payoff)
- Pre-launch overshoot warning (same)
- Regional delivery chains (simple rule on top of existing scoring)

**Do first, do well, do now:**

- Graph routing. This is the game. Everything else is secondary.

---

## 5. The "Feels Like Earth" Delusion

The user said: "This is supposedly set on real planet earth, and yet I just don't feel it."

The project's response was to add country outlines, Blue Marble texture, lat/lon grid, city lights, and constellation positions. These are all visually correct representations of Earth-ness. None of them create the *feeling* of Earth-ness.

Here is the hard truth: a 3D globe viewed from 50-200km altitude will never feel like "being in Glasgow." Glasgow is tenements, rain, the Clyde, chip shops. From 50km up, Glasgow is a faint cluster of lights on the west coast of a small island. No texture resolution will fix this. No amount of country outlines will make a sphere feel like a place.

The wrong goal is photorealism from orbit. The right goal is *named familiarity*.

What creates sense of place in a globe game:

- **Names, prominently displayed.** When you are above Glasgow, the word GLASGOW should be visible. Not a 7px monospace label on a 2D overlay map. On the globe. In the 3D scene. Readable.

- **Contextual flavor text.** "Glasgow, Scotland. Population 600,000. Known for: shipbuilding, rain, deep-fried everything." A single sentence creates more sense of place than a 4K texture.

- **Cultural color.** A tiny flag sprite. A landmark silhouette. A two-word descriptor ("Steel City," "City of Light"). These are cheap, effective, and human.

- **Route narrative.** "Glasgow to Heathrow" is a commuter route. "Heathrow to Narita" is an international crossing. "Narita to Kyoto" is a domestic hop. The game should *tell you this*. "Short domestic hop -- 300km" vs "Transpacific crossing -- 9,500km." The numbers alone do not create geography. Words do.

The game currently treats Earth as a rendering challenge. It should treat Earth as a storytelling opportunity.

---

## 6. The 3-Minute Session Contradiction

The game has a 180-second timer. The vision document describes graph routing where you plan multi-hop routes: Glasgow to Heathrow to Narita to Kyoto. That is 4 hops. At current physics, each hop takes 15-30 seconds of flight time plus landing, choosing next hop, and charging. A 4-hop route would consume the entire session with zero margin for error.

These two design goals are in direct tension:

- **Score attack** wants fast decisions, rapid bouncing, adrenaline, and flow state. It rewards muscle memory and pattern recognition. Think: Crossy Road, Super Hexagon, Flappy Bird.

- **Route planning** wants strategic thinking, map reading, trade-off evaluation, and geographic knowledge. It rewards planning and foresight. Think: Mini Metro, Ticket to Ride, Flight Control.

They *can* coexist, but not in 3 minutes with the current pace. Two options:

**Option A: Lean into arcade.** Drop the session timer to 90 seconds. Make each hop take 5 seconds max. Auto-select routes. The game becomes about execution, not planning. Fast, twitchy, mobile-friendly.

**Option B: Lean into strategy.** Extend sessions to 10 minutes or remove the timer entirely. Make route selection the core decision. Slow down flight. Add fuel or energy as a constraint. The game becomes about efficient pathfinding, not bounce accuracy.

The current design tries to be both and achieves neither. The 3-minute timer says "arcade" but the Glasgow-to-Kyoto fantasy says "strategy." Pick one.

---

## 7. What Would a Player Actually Say

**2 stars -- "TechBro42"**

> Beautiful screensaver. Not a game. I loaded it up, tapped the screen, watched a ball fly around a globe for 3 minutes. I genuinely could not tell whether I was winning or losing. There is an absurd amount of visual detail -- constellations? Lagrange points?? -- but I could not figure out what I was supposed to DO. Bounced a few times, got some points, session ended. Uninstalled. Looks like it was built by someone who loves space more than they love game design.

**3 stars -- "CasualCaz"**

> The idea is brilliant and the planet looks incredible. Flying over the Earth as a glowing ball is genuinely cool for about 90 seconds. The problem is that after those 90 seconds, every hop feels exactly the same. Charge, fly, land, repeat. I could not tell Tokyo from Toronto from the air. The "choose delivery" menu gives me three airport codes I do not recognize. Is TSA a real airport? I have no idea. There is a "Ship's Computer" with an orbital view of the Earth-Moon system -- why? Am I going to the Moon? I am confused. Three stars because the tech is legitimately impressive and I can see the potential, but right now it is all sizzle, no steak.

**4 stars -- "IndieDevFan"**

> This is the most ambitious browser game I have played in years. The attention to detail in the space environment is insane -- real constellation positions, aurora borealis, working ISS. As a game it needs work: the bounce-and-deliver loop gets repetitive after a few rounds, and the 3-minute session feels arbitrary. But the bones are here for something special. If the developer adds proper route planning (the Glasgow-to-Kyoto idea mentioned in the docs sounds perfect) and makes each airport feel distinct, this could be a genuinely unique title. Right now I keep coming back just to spin the globe and look at the sky. Four stars for ambition and craft, with one star held back until it feels like a game.

**5 stars -- "SpaceNerd_99"**

> OK so this is clearly not finished but I do not care. Someone built a game where you bounce around a real Earth with actual astronomical data. The Moon is in the right place. The constellations are correct. There are Lagrange point markers. I spent 45 minutes in the Ship's Computer ORBIT tab just watching the Moon orbit. The ISS camera mode lets you look down at Earth from the station. I am rating this 5 stars for the space simulation alone. The game part is honestly whatever -- I just want to float around and look at the sky. Please add more orbital mechanics. Hohmann transfers when?

**5 stars -- "DesignGuy_UK"**

> The aesthetic here is genuinely beautiful -- candy-colored space tech with real geography. The charge-and-bounce mechanic is satisfying once you get the feel for it. The squash and stretch animation on the pod is delightful. Landing on the bullseye and hearing the delivery chime is a little dopamine hit. Yes, it needs more game. Yes, the features are scattered. But this has a vibe that 99% of indie games never achieve. The visual identity is fully formed. Now it just needs to become a game to match. I am giving 5 stars because I believe in where this is going, not where it is. Do not let this project die.

---

## 8. The Minimum Viable Game

Ship tomorrow. Here is what you keep:

**KEEP:**
- Planet with Blue Marble texture and country outlines
- 20 airports as bounce pads with target rings
- Bounce physics (charge, launch, fly, land)
- Accuracy scoring (bullseye/inner/outer)
- Destination arrow and progress bar
- Delivery choice (short/medium/long)
- Score counter
- 3-minute session timer
- Atmosphere and stars (basic, not the full planetarium)
- Audio cues for bounce, land, deliver
- Pod with squash/stretch and orientation

**CUT:**
- Constellation stick figures
- Deep field galaxies (both systems)
- Lagrange point markers
- Magnetic field lines
- Orbital mechanics system (use a static sun direction)
- Ship's Computer ORBIT tab
- Time warp controls
- Satellites
- ISS camera mode
- Lat/lon grid
- Ship's Computer DEBUG tab (keep for dev, strip from release)
- Aurora (keep if it costs zero gameplay performance, cut if it costs frames)
- Moon rendering with correct orbital position (use a static sprite)
- Nebula sprites
- lil-gui debug panel

**ADD (the one thing the game is missing):**
- Airport name labels visible in 3D, on the globe, from flight altitude. Not in a 2D overlay. Not in a menu. On the planet. When you are flying toward Heathrow, you should see the word HEATHROW growing larger as you approach. This single change would do more for "feels like Earth" than every other feature combined.

That minimum viable game is approximately 4,000 lines instead of 8,000. It loads faster. It runs smoother on mobile. It has a clear identity: you are a courier bouncing between named airports on a beautiful Earth. Everything else is future work.

---

## 9. The Hard Recommendation

**The one thing:** Make airports into places, not coordinates.

Right now an airport is a glowing ring on a sphere. It has a 3-letter IATA code in a debug panel. It has a lat/lon position. It is indistinguishable from every other airport.

Make each airport a *place*. A name rendered in 3D. A city name. A country. A tiny visual signature -- even just a colored dot that matches a regional palette. When you land at Narita, you should know you are in Japan. When you are choosing your next hop, you should see destination names that evoke real geography: "LONDON HEATHROW," not "LHR."

This is not a feature. It is a reframing. The game stops being about bouncing between abstract nodes on a sphere and starts being about traveling between real places on Earth. The gameplay mechanics do not change. The code changes are small. The experiential difference is enormous.

Right now, the game answers: "Can we render Earth accurately?" The game should answer: "Does it feel like you are traveling across Earth?" Those are completely different questions, and the second one is solved with words, names, and identity, not shaders, textures, and astronomical libraries.

---

## 10. What is Actually Good

The bounce physics are satisfying. The charge mechanic has genuine risk/reward: hold longer for more power, but overshoot and waste time. The squash/stretch animation on the pod sells the impact. The trajectory arc preview during charge is smart feedback. The concentric target rings give landing a clear goal. These are the bones of a real game mechanic, and they work.

The visual identity is fully formed and distinctive. Candy-colored space tech on a real globe is a unique aesthetic that no other browser game occupies. The bloom, the atmosphere, the glow -- when they are not overwhelming the gameplay, they create a mood that is genuinely inviting. The pod design (eyes forward when parked, dolphin silhouette in flight) has character.

The audio design shows real craft. The charge growl building tension before launch, the bounce pop, the delivery chime -- these create a feedback loop that feels good. The wind layer that scales with speed is a subtle touch that adds to immersion. 770 lines of procedural audio is overkill, but the result sounds right.

The delivery choice mechanic (short/medium/long with different point values) is a simple but effective risk/reward decision. It gives the player agency without complexity. It is the right level of strategic depth for an arcade game.

The proximity arrow and progress bar are excellent wayfinding tools. They solve the "where am I going" problem cleanly. More of this kind of thinking -- functional, player-serving UI -- and less of the planetarium approach.

And the ambition is real. This is not a cynical project. Someone genuinely wants to make a game where you bounce around the real Earth delivering packages, and they have built a remarkable technical foundation for it. The problem is not lack of talent or effort. The problem is that the effort has been pointed at the sky when it should have been pointed at the ground.

The seed of something special is here: a globe, airports, bouncing, delivering. That is a game. Everything around it -- the constellations, the Lagrange points, the orbital mechanics, the magnetic field lines -- is a planetarium. The game needs to escape the planetarium.

Stop making the sky more beautiful. Start making the ground more meaningful.
