# Simulated Playtest Reports: Five Player Archetypes

**Date**: 2026-02-14
**Build**: Current state as documented (20 airports, Blue Marble texture, delivery loop, no tutorial, no graph routing)
**Method**: Simulated first-session playtests based on comprehensive documentation review. All observations are inferences from documented features, known bugs, UI layout, and prior review feedback. The author cannot visually test the game.

---

## Player A -- "The Casual Mom"

**Profile**: Age 45. Plays Candy Crush and Wordle daily on her iPhone. Has never used WASD in her life. Comfortable with tap-and-hold gestures from mobile games. Low tolerance for confusion; high tolerance for pretty things.

### First 30 Seconds

She taps a link someone shared in a group chat. The loading screen appears: a cute blue pod swoops in with a trail, the title "GLO-BALL GOPHER" fades up, and a tagline reads "Bounce the Globe. Deliver the Goods." She thinks it looks polished. The loading bar fills. She reads "You are a magnetic delivery pod. Pick a route. Hop airport to airport. Don't drop the package." She half-reads this. The loading screen fades.

Now she is staring at a 3D globe in space. There is a lot on screen: a panel in the top-left saying "CURRENT PACKAGE" with a parcel emoji, a panel in the top-right showing "ALTITUDE KM," a score panel below that, a countdown reading "3:00" at top-center, a direction arrow, and a glowing circle in the bottom-right with a lightning bolt that says "LAUNCH." In the bottom-left, small text says "NEAREST AIRPORT" and beneath that, "Hold launch - Tap airport to target."

She does not read the bottom-left text. She does not know what "IATA" means. She sees three delivery options ("CHOOSE DELIVERY") at the bottom-center with green, purple, and orange cards. She taps the green one because green means easy. A timer starts. The delivery choice vanishes.

### Minutes 1-3

She now has a package to deliver. The direction arrow at top-center points somewhere. She does not know what to do. She taps the globe. Nothing obvious happens. She taps the lightning bolt button. She taps it quickly (under 200ms), producing a "Scenic Hop" -- a gentle low bounce. The pod rises slightly off the surface and comes back down. She hears a bounce sound. She has no idea if she did the right thing.

She taps it again. Another small hop. She does this four or five times. The progress bar at the top barely moves. She has not moved meaningfully toward her destination because quick taps produce short hops in whatever direction the pod happens to be aimed, and she has not steered.

She notices the arrow is still pointing off-screen. She tries swiping on the globe. This might adjust her aim direction or trigger the free camera -- it is unclear to her what happened. She holds the launch button this time, sees the charge ring fill up, and releases. The pod arcs dramatically upward. The Earth shrinks below. She sees aurora, stars, maybe the ISS in the distance. It looks beautiful.

She lands somewhere far from her target. The timer is running out. "OVERSHOOT!" may or may not appear depending on her trajectory. She feels disoriented. The globe has rotated. She does not know which continent she is above. The country outlines help a little, but at altitude, the Blue Marble texture is pretty but she cannot identify the landmass beneath her.

The delivery timer expires. She sees "-100" and "EXPIRED" in red. She feels punished. A new delivery choice appears. She picks green again. She taps the launch button a few more times randomly. The session timer runs out. "TIME'S UP" appears. She scored under 200 points. "TRAINEE COURIER."

### Post-Session Reaction

She texts her friend: "I tried that globe game. It's really pretty but I had absolutely no idea what I was supposed to do. I just kept bouncing randomly. How do you steer??"

### Would She Play Again?

**Probably not.** She needed guidance in the first 10 seconds that never came. There is a tutorial hint (the `#tutorial-hint` element that auto-fades over 8 seconds), but based on the CSS it appears mid-screen and fades before she has processed the delivery choice. She never learned that holding longer = going farther, that swiping steers, or that the arrow shows where to go. She felt punished (expired delivery) before she felt rewarded.

If a friend sat next to her and said "hold the button, aim at the arrow, let go," she would get it instantly. The game is one tutorial screen away from being accessible to her.

### One Quote

> "It's gorgeous, but I literally could not figure out how to move in the right direction."

---

## Player B -- "The Hardcore Gamer"

**Profile**: Age 22. Plays Elden Ring, Hades, Celeste. Craves mastery curves. On desktop with keyboard and mouse. Immediately looks for systems to exploit. Evaluates a game in under 60 seconds.

### First 30 Seconds

He skips reading the loading screen text. He is already scanning the UI for interactable elements. Loading finishes. He sees the delivery choices. He picks orange (LONG) because higher risk = higher reward, obviously. Timer starts. He hits SPACE immediately. Quick pulse. He notices the pod barely moves. He holds SPACE longer. The trajectory arc appears. He sees the charge ring change color -- blue, green, orange. He releases at green. The pod launches in a satisfying arc.

He immediately hits WASD. He feels the steering nudge the trajectory. He is already watching the direction arrow and the distance readout. The progress bar is moving. He is oriented within 15 seconds.

### Minutes 1-3

He delivers his first package in about 40 seconds. He lands inside the outer ring. "DELIVERED!" flashes. +375 or similar. He immediately picks another LONG delivery. He is experimenting with charge timing. He overshoots once, notes the "OVERSHOOT!" feedback, adjusts next time. By his third delivery attempt he is consistently landing in the PRECISE ring.

He discovers rapid-tap boost mid-air by accident -- he was mashing SPACE trying to steer harder, and suddenly "BOOST! BOOST x2! BOOST x3!" appears with rising pitch. He grins. He arcs spectacularly over half the planet. He overshoots by 4,000 km. Worth it. He files this away as a tool for long deliveries.

He delivers 4-5 packages in 3 minutes. He hits a combo once (two deliveries within 15 seconds) and sees the x2 multiplier. He finishes around 2,500 points. "SKILLED COURIER."

He immediately hits PLAY AGAIN. Second session he is strategic: he picks SHORT deliveries and chains them fast to build combo. He hits x3 and scores over 4,000. He is learning the system.

### Post-Session Reaction

He thinks: "The feel is good. The rapid-tap boost is excellent. But..." He opens the scoring formula in his head and realizes that SHORT deliveries chained for combo are strictly dominant. There is no reason to pick LONG once you understand the multiplier math. The combo window (15 seconds) is generous enough that SHORT-SHORT-SHORT chains reliably hit x4 or x5.

He also notices: altitude does nothing mechanically. It is purely cosmetic. The game says "ALTITUDE KM" but there is no gameplay consequence to going high vs. low. In Celeste, every height has meaning. Here, it is a screensaver layer on top of the actual game.

He presses H and finds the debug panel. He presses M and finds the Ship's Computer. He is impressed by the debug tooling but notes it is developer-facing, not player-facing.

### Would He Play Again?

**Two or three more times, then probably not.** The scoring system is solvable in about 10 minutes. Once he finds the optimal strategy (spam short deliveries, chain combos, never pick long), the game collapses into execution without variety. He needs: altitude as a mechanic, the graph-routing hop system, and some form of risk/reward that makes LONG deliveries situationally optimal.

The rapid-tap boost is the seed of a great skill mechanic, but it is currently counterproductive for scoring (you overshoot). If overshooting with boost gave you access to airports you could not otherwise reach in time, that would create interesting decisions.

### One Quote

> "The boost is sick. The scoring meta is solved in five minutes. Give me a reason to go high."

---

## Player C -- "The Geography Nerd"

**Profile**: Age 35. Plays GeoGuessr religiously, 200+ hours in Flight Simulator. Knows IATA codes for major airports. Will immediately look for London Heathrow, recognize coastline shapes, and judge the map by its accuracy.

### First 30 Seconds

Loading screen reads "Glo-ball Gopher." Interesting. Game loads. They see the globe. Immediately: "Is that the Blue Marble texture? It is." They recognize Africa's shape. They look for Europe. They see country outlines layered over the texture. They are pleased. They notice city lights on the night side. They zoom in mentally on the trampoline pads -- the nearest airport label says a real IATA code. They are intrigued.

They pick a MEDIUM delivery. The destination says something like "MEX" or "NRT." They know immediately where that is on the globe. They have a spatial advantage over every other player archetype.

### Minutes 1-3

They launch and steer toward the target. During the high arc, they are looking at the planet, not the HUD. They try to identify the coastline of Japan, or the boot of Italy, or the Nile delta. The country outlines help enormously. They are having a dual experience: playing the game AND enjoying the geography.

They land their first delivery. They notice the 20 airport names as they bounce between them. "Why is Kiritimati in here but not Heathrow? Oh wait, this is a curated 20, not the full set." They wonder why the 20 were chosen. Some of them feel arbitrary.

They complete 3 deliveries. They are competent but not focused on score optimization. They are spending time between deliveries rotating the globe mentally, trying to place themselves. The direction arrow helps but they almost do not need it -- they are navigating by geography.

### Post-Session Reaction

Mixed. The globe is satisfying as a geography object. The Blue Marble texture at distance looks correct. Up close it gets blurry (BUG-3 confirms this). They are mildly disappointed that there are only 20 airports -- they want to see the full route network from the data (13,143 route pairs). They want the graph-routing mechanic described in the user's vision: land at Narita, see which airports connect, pick Kyoto or Seoul or Anchorage. This is exactly their kind of game -- network optimization on a real globe.

They are frustrated that IATA codes appear but there is no deeper engagement with them. They want city names, not just codes. They want to see which continent a delivery takes them to before they pick it.

### Would They Play Again?

**Yes, casually, while waiting for the graph-routing update.** The geography layer is compelling enough to keep them interested, but the gameplay is too thin for their tastes. Once graph routing exists (hop-by-hop with radial dialogs), this becomes a daily driver for them. They are this game's most natural audience -- they are just early.

### One Quote

> "The fact that it uses real IATA codes and a real globe is exactly right. Now let me actually route between them."

---

## Player D -- "The Developer"

**Profile**: Age 28. Plays everything. Also a Three.js hobbyist who has built a few WebGL demos. They will look at the rendering pipeline, open DevTools, and read the source code.

### First 30 Seconds

They notice the loading screen is pure CSS (no canvas) -- the pod animation is keyframed CSS with transforms. Clever. They note the `clamp()` functions everywhere in the CSS. Responsive design done properly. The import map in the HTML uses Three.js r0.160.0 from CDN. They open the network tab and see the Blue Marble texture loading from unpkg.

Game loads. They see the planet with atmospheric scattering (custom ShaderMaterial, they assume). The bloom is immediately noticeable -- UnrealBloomPass. They spot the chromatic aberration at screen edges. The post-processing stack is: RenderPass, BloomPass, ChromaticAberration, OutputPass. Standard but well-tuned.

### Minutes 1-3

They play the game normally for about 90 seconds, then open DevTools. They check the console -- clean, no warnings spewing every frame (good discipline). They look at the frame rate: reasonably smooth on their machine. They notice `logarithmicDepthBuffer: true` in the renderer config (they can tell from the depth precision on the distant planet surface). They know this is necessary for a planet-scale scene.

They examine the scene graph. Planet mesh, atmosphere shell, cloud layer, aurora, ISS, stars, constellations as point sprites or stick-figure lines, deep field galaxy sprites, country outline lines, trampoline pads, target rings, player pod with trail. A lot of objects, but well-organized by component.

They are impressed by:
- The architecture: clean separation into components/ and systems/ directories
- The procedural audio (Web Audio API synthesis, no audio files to load)
- The custom shaders for atmosphere and aurora
- The CSS-only loading screen that replicates the 3D pod
- The amount of astronomical accuracy (real RA/Dec for constellations, real magnetic field tilt)

They critique:
- The HTML file is doing too much -- 1200+ lines of inline styles and DOM. This should be componentized, even with vanilla JS
- The `index.html` contains the entire UI as inline styles rather than a separate stylesheet
- Deep field galaxy sprites are too prominent (they noticed the pink/orange circles that BUG-4 describes)
- The post-processing is heavy for mobile. No obvious LOD strategy for the shader pipeline
- The `lil-gui` debug panel is still bundled in production. Should be behind a build flag
- No service worker or offline capability despite being a good PWA candidate

### Post-Session Reaction

They fork the repo. They want to study the atmospheric scattering shader. They think the overall architecture is surprisingly clean for a game that was clearly built iteratively with AI assistance. The component boundaries make sense. The physics is simple but appropriate (radial gravity, bounce force, air resistance).

They would have made different choices: WebGPU compute shaders for the aurora, instanced meshes for the airports instead of individual sprites, a proper ECS rather than the current component-system hybrid. But these are preferences, not errors.

### Would They Play Again?

**They will not play it as a game, but they will study it as a codebase.** They might contribute a PR if the repo is public. The rendering quality per line of code is high. The gameplay is not their focus -- they see this as a Three.js showcase with game mechanics bolted on, which is exactly what the user diagnosed ("more experience than game").

### One Quote

> "The atmospheric scattering is genuinely good. The architecture is clean. It just needs to be a game, not a tech demo."

---

## Player E -- "The 8-Year-Old"

**Profile**: Age 8. Plays Roblox and Fortnite. Has an iPad. Understands "tap to do things" but does not read small text. Attracted to bright colors and big reactions. Attention span of roughly 45 seconds before verdict is rendered.

### First 30 Seconds

The loading screen has a cute blue character with eyes. "Cool!" The name "Glo-ball Gopher" does not register as a pun. They see the progress bar filling. They tap impatiently.

Game loads. They see a planet in space. "Whoa, it's Earth!" They see glowing things. They do not read any of the HUD text. They see three cards at the bottom. They tap the orange one because orange is their favorite color (it is also the hardest difficulty, but they cannot read the meta text). Timer starts.

They see the lightning bolt button. They mash it. Tap tap tap tap. The pod does small hops. Each hop has a satisfying sound. They are not going anywhere meaningful but the tapping feels good.

### Minutes 1-3

They accidentally hold the button longer and the pod launches high. "WHOA!" The Earth gets small. They see stars. They see the aurora. This is the peak moment. They are 45 seconds in and they have seen the best thing the game can show them.

They land somewhere. The delivery timer expires with a -100 penalty. They do not notice or care about the score. They just want to go high again. They hold the button, launch again. They discover rapid-tap boost mid-air. "BOOST! BOOST x2! TURBO!" They are screaming. This is extremely their thing. The escalating pitch, the speed, the arcing over continents -- this is the Fortnite launch pad moment.

They do this three or four times. They are not delivering packages. They are just launching and boosting. The session timer runs out. "TIME'S UP" screen shows a low score. They do not care. They hit PLAY AGAIN and repeat the boost loop.

By the third session, they have accidentally delivered a package by landing near a target. "DELIVERED!" flashes with a score animation. "Cool!" But they go right back to boosting.

### Post-Session Reaction

They shove the iPad at their parent: "Look at this! Watch!" They hold the button and launch. They rapid-tap boost. The pod soars over the planet. The parent says "That's pretty." The child does not mention packages, deliveries, accuracy, or scoring. To them, this game is a planet launcher with a cool boost button.

### Would They Play Again?

**Yes, for about a week, as a toy rather than a game.** They will show friends at school. They will compete on "who can go highest" (which has no in-game tracking). They will never engage with the delivery system in a meaningful way. They will eventually move on because there is no progression, no unlockables, no skins, no social component -- all the things that keep Roblox and Fortnite sticky.

If there were a "highest altitude" leaderboard, or cosmetic unlocks for the pod, or a mode where you just free-fly and explore, they would stay longer.

### One Quote

> "Watch this. WATCH. Boop boop boop boop TURBO! Did you see how high I went??"

---

## Cross-Player Analysis

### What is Universal (everyone struggles with this)

**Disorientation in the first 10 seconds.** Every player, regardless of archetype, faces the same problem: the game loads to a 3D globe with a dense HUD and no guided first action. The tutorial hint exists but auto-fades in 8 seconds, which is not enough time for any player to absorb it while also processing the delivery choice, the HUD elements, and the 3D viewport.

The sequence should be: (1) see one thing to do, (2) do it, (3) see the result, (4) see the next thing. Currently the sequence is: (1) see everything at once, (2) guess.

**Steering is opaque.** No player archetype naturally discovers that swiping on the screen (or pressing WASD) steers the pod mid-air. The Casual Mom never finds it. The Hardcore Gamer finds it by systematic button-pressing. The 8-Year-Old never needs it because they are not trying to aim. The current UI says "Hold launch - Tap airport to target" in 0.55rem text in the bottom-left, which nobody reads during their first session.

### What is Polarizing (some love it, others hate it)

**The visual spectacle.** The Casual Mom finds it pretty but disorienting. The Hardcore Gamer finds it irrelevant to gameplay. The Geography Nerd finds it satisfying. The Developer finds it technically impressive. The 8-Year-Old finds it the entire point. The same feature -- the beautiful globe with atmosphere, aurora, and stars -- is the main attraction for some and a distraction for others.

**The IATA codes.** The Geography Nerd lights up when they see "NRT" and knows it means Narita. Everyone else sees a random three-letter string. For 4 out of 5 archetypes, airport codes are meaningless without city names alongside them.

**The rapid-tap boost.** The documentation calls this "the most fun input in the game," and the 8-Year-Old and Hardcore Gamer both confirm this. But it is anti-synergistic with the scoring system -- boosting causes overshooting, which hurts your score. The Hardcore Gamer files this as "fun but suboptimal." The 8-Year-Old does not care. This tension is either a design problem or a design opportunity, depending on whether you add altitude-as-mechanic.

### The Single Biggest Barrier to Fun

**No onboarding.** Not a tutorial. Not a tooltip. Not even a single forced first action. The game asks the player to understand charge mechanics, steering, delivery selection, accuracy scoring, combo timing, and spatial navigation on a 3D sphere -- all at once, with no guidance.

Every player archetype would benefit from the same thing: a single forced first delivery to a nearby, easy target, with three prompts: "HOLD the button," "AIM at the arrow," "RELEASE." This takes 15 seconds to implement in the player's mind and transforms the experience from bewildering to comprehensible.

The Hardcore Gamer would blast through it in 5 seconds. The Casual Mom would finally understand the game. The 8-Year-Old might actually deliver a package. The Geography Nerd would start navigating immediately. The Developer would appreciate the UX consideration. Everyone wins. Nobody loses.

### The Single Biggest Source of Delight

**The moment the pod launches high and the planet shrinks below.** This is the screenshot moment. This is what the 8-Year-Old shows their parent. This is what the Geography Nerd admires. This is what the Developer screenshots for Twitter. The transition from surface-level play to orbital-scale view is genuinely dramatic, and the fact that it happens through a single button hold (not a menu or a cutscene) makes it feel earned and personal.

The rapid-tap boost amplifies this into euphoria for the players who discover it. The escalating pitch, the stacking multiplier text, the arcing trajectory over continents -- this is the game's signature moment. It just needs to be connected to gameplay rather than punished by it.

---

## The Verdict

### If this game went on itch.io tomorrow

**Rating: 3.5 out of 5 stars** (with high variance -- some 5-star ratings from people who love the aesthetics, some 2-star ratings from people who could not figure out the controls).

The rating would be held back by:
- The lack of onboarding (responsible for most of the 2-star reviews)
- The shallow scoring meta (solvable in minutes by experienced players)
- The disconnect between the visual ambition and the gameplay depth

The rating would be lifted by:
- The visual quality (genuinely impressive for a browser game)
- The rapid-tap boost (universally delightful to discover)
- The real-geography globe (a differentiator no competitor has)
- The one-button simplicity once understood

### Probable Top Comment

> "This is one of the most beautiful browser games I've ever seen. I just wish it told me how to play it. Spent my first two sessions bouncing randomly before I figured out you have to hold the button and aim at the arrow. Once I got that, it was really satisfying. Needs more depth though -- I felt like I'd seen everything after 15 minutes. The boost mechanic is incredible and should be the whole game. 4/5 for vibes, 2/5 for game design."

### Probable Most-Liked Reply

> "Agree on the boost. I showed my kid and she just held the button and mashed the screen for 20 minutes screaming. She never delivered a single package and had the time of her life. Maybe that IS the game."

---

*Report generated from documentation review only. All player reactions are simulated inferences, not observed behavior. Actual playtesting with real humans would likely surface additional issues (and delights) not captured here.*
