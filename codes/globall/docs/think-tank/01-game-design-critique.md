# Glo-ball Gopher -- Game Design Critique

**Author**: External game design review
**Date**: 2026-02-14
**Context**: Post-playtesting analysis. User verdict: "Looks glorious but very disorienting. More experience than game." Two identified failures: (1) doesn't feel like Earth, (2) no graph-routing mechanic.

---

## 1. The Identity Crisis

Glo-ball Gopher is currently two games wearing the same skin.

**Game A** is a score-attack arcade game. Charge, launch, land on the bullseye, rack up combos, beat the clock. This is the game that actually exists in the code right now. It has a 3-minute session timer, combo multipliers up to x5, accuracy tiers, progressive difficulty via tighter timers and smaller rings. It is a game about *aim and timing*.

**Game B** is a route-planning strategy game. Glasgow to Heathrow to Narita to Kyoto. Pick the next hop from a radial dialog. Graph theory lurks. The 13,143 route pairs sit in memory doing almost nothing. The hop-by-hop code (`offerHopChoices`, `acceptHop`) exists but serves as a thin waypoint layer on top of Game A's "fly to the final destination" structure. This is a game about *navigation and decision-making*.

These two games are not inherently incompatible. But right now they are fighting each other.

The score-attack loop wants you to *skip* intermediate hops. Why bounce to Heathrow and then to Narita when you could try to arc directly to Kyoto for a bigger time bonus? The hop system adds +10 seconds per hop but the scoring formula rewards fast delivery. The economically rational strategy is: ignore the graph, go direct.

The route-planning loop wants you to *slow down and choose*. Reading a radial dial, evaluating which of five hub options gets you closer, considering alternate paths -- this is thoughtful, not frenzied. It belongs in a different tempo than the breathless combo timer.

**The fix is not to pick one. It is to make the graph the *structure* and the score-attack the *execution*.**

Think of it like *FTL: Faster Than Light* meets *Lonely Mountains: Downhill*. In FTL, you plan your route through the sector map (strategy), then fight each encounter (action). In Lonely Mountains, you pick a trail (decision), then execute the run (skill). The planning phase and the execution phase alternate. They breathe.

Concretely: the route is chosen *before* launch, not during flight. The player should see a mini-map overlay showing 2-3 possible paths from origin to destination (auto-computed via the route graph). They pick a path. Then they execute each hop as a bounce-and-land skill challenge. The score for each hop is immediate. The cumulative route score is the sum. Bonus multiplier for completing the full route without missing a hop. This way the graph serves the arcade, not the other way around.

**Reference**: *Mini Metro* does this brilliantly -- network topology IS the game, but moment-to-moment play is still reactive and fast.

---

## 2. The Core Loop Problem

The current loop in the spec reads:

> Choose --> Aim --> Launch --> Steer --> Land --> Score --> Repeat

The user wants:

> Land --> Choose next hop --> Launch --> Fly --> Land --> Choose next hop --> ...

These are different rhythms. The current loop has one big arc per delivery. The user's loop has many small arcs per delivery. The current system assigns a distant destination and says "get there however you want." The user's system says "the journey IS the game."

The critical question: **what happens when you land at an intermediate hop?**

Right now, `checkHubLanding` triggers `offerHopChoices` when you touch down near a hub. But the hop dialog is just a list of next airports. There is no *moment* at each hop. No reward, no feedback, no ceremony. You land, a menu appears, you tap, you launch again. This is admin, not gameplay.

Each hop landing should be a *micro-delivery*. Here is what I would propose:

1. **Land at hop** -- accuracy scored (bullseye/precise/delivered) just like final delivery. Immediate points awarded. Satisfying ring pulse.
2. **Hop bonus popup** -- "Hop 2/4 -- LHR -- 850 pts" with a quick 1.5-second celebration. Not long enough to break flow, long enough to feel rewarding.
3. **Auto-advance to next waypoint** -- if the player pre-selected a route, the next hop target is already set. No dialog interruption. The radial dialog only appears if the player *didn't* pre-select a route (free-routing mode).
4. **Chain bonus** -- landing and re-launching within 2 seconds of touchdown multiplies the next hop's score by 1.3x. This rewards the rapid-fire bounce rhythm the user already loves.

This makes the loop:

> Choose route --> [Launch --> Fly --> Land (score!) --> Chain launch -->]x4 --> Final delivery (big score!)

Each hop is a skill check. The route is a sequence of skill checks. Combo multiplier climbs with each clean hop. Miss a hop target (overshoot) and you can still reach it, but the combo resets and you lose the chain bonus.

**Reference**: *Celeste* chapter structure -- each screen is its own challenge, but they chain into a larger journey. Finishing a screen feels good; finishing a chapter feels great.

---

## 3. What Makes Bouncing Fun

The docs say rapid-tap boost in mid-air is "the most fun input in the game." Let's examine why and then design around it.

Rapid-tap boost works because it gives the player *continuous agency during a phase that would otherwise be passive*. Without it, the airborne phase is "watch the arc play out." With it, you are actively pumping energy into your trajectory, extending range, fighting gravity. It transforms flight from a cutscene into a verb.

This is the same design principle behind *Flappy Bird*'s tap (fight gravity continuously), *Jetpack Joyride*'s hold-to-rise mechanic, and the long jump in every *Mario* game (hold the button for more height). The common thread: **a simple input that extends your commitment to a risky action**.

To build around this feeling:

### 3a. Make rapid-tap altitude-sensitive (see Section 5)
At low altitude, each tap gives a big boost because air is thick. At high altitude, each tap gives diminishing returns because air is thin. This creates a natural skill ceiling: the best players know exactly when to stop tapping.

### 3b. Add a rhythm element
Instead of "tap as fast as possible," introduce a *pulse indicator* on screen during flight -- a ring that contracts and expands. Tapping in sync with the pulse gives 1.5x boost per tap. Tapping out of sync gives 0.7x. This turns frantic mashing into skilled rhythmic input, like *Crypt of the NecroDancer*'s movement system. It also solves the accessibility problem of rapid-tap being RSI-inducing.

### 3c. Tap-to-steer integration
Currently WASD/swipe steers during flight and rapid-tap boosts. These are independent axes. What if the boost *direction* was influenced by your current steering input? Tap while holding right = boost rightward. This gives the player a tool to course-correct with visceral, chunky inputs instead of the subtle analog steering that the user finds "disorienting."

### 3d. Boost fuel as a resource
You have bounceCharge that regenerates. Currently it only matters at launch. What if mid-air taps consumed a visible fuel gauge? Full gauge = 8 taps. Recharges on landing. Now the player must *budget* their boosts: use them early to gain altitude, or save them for course correction near the target. This creates a real decision in what is currently a spam-input.

**Reference**: *Downwell*'s gunboots -- the core verb (shooting downward) is also the movement verb (slowing descent). One input, two purposes, infinite depth.

---

## 4. The 3-Minute Session Problem

Three minutes is exactly right for Game A (score-attack) and exactly wrong for Game B (route-planning).

A Glasgow-to-Kyoto route through 4 hops will take approximately 45-75 seconds per hop (charge, fly, land, brief celebration). That is 3-5 minutes for one route. A 3-minute timer means you might not even finish your first multi-hop delivery. The timer creates anxiety that fights the contemplative pleasure of choosing your route through the network.

**Proposal: replace the clock with a fuel/energy system.**

You start with 10 units of "field energy." Each bounce costs 1 unit. Landing on a hub airport recharges 0.5 units (the EM trampoline pad tops you up). Bullseye landings recharge 0.8 units. Missing a hop (overshooting and having to bounce back) costs you an extra unit with no recharge. The game ends when energy hits zero.

This system:
- **Rewards skilled play** with longer sessions (bullseyes extend your game)
- **Punishes mistakes** proportionally (a miss costs ~1.5 units vs. a hit costing ~0.2 net)
- **Creates natural session variance** -- a bad game is 6-8 bounces (2 minutes), a great game is 20+ bounces (6-7 minutes)
- **Removes clock anxiety** during the hop-selection dialog (choosing your route doesn't cost energy)
- **Preserves urgency** because you can see your energy draining, and you know each miss shortens your game

You can still display an elapsed timer for personal bests, but it is not the termination condition.

If the 3-minute clock must stay (for competitive leaderboards or bite-sized mobile sessions), then at minimum: **pause the clock during hop selection**. The player should never feel punished for thinking.

**Reference**: *Spelunky*'s ghost timer -- it doesn't end your run immediately, it applies pressure. *Into the Breach* pauses between actions for as long as you need. Pressure and decision-making require different tempos.

---

## 5. Altitude as Mechanic

The VISION doc has a beautiful altitude table (Surface / Low / Mid / High / Space) that is currently decorative. Here is how to make each layer matter.

### The Core Rule: Higher = Faster, Lower = Easier

| Altitude Layer | Speed Multiplier | Landing Accuracy | Boost Efficiency | Risk Level |
|---|---|---|---|---|
| Surface (0-5km) | 1.0x | Easy (large rings) | 1.0x per tap | Safe |
| Low (5-50km) | 1.3x | Normal | 0.9x per tap | Low |
| Mid (50-200km) | 1.7x | Reduced ring visibility | 0.7x per tap | Medium |
| High (200-400km) | 2.2x | Rings barely visible | 0.5x per tap | High |
| Space (400km+) | 2.5x | No visual rings, instruments only | 0.3x per tap | Extreme |

### Concrete Mechanics

**Speed bonus**: Horizontal velocity scales with altitude. A bounce that peaks at 300km altitude covers ground 2x faster than one that peaks at 30km. This makes high arcs genuinely useful for long-distance hops, not just visually dramatic.

**Landing difficulty**: Target rings physically shrink (or their visual opacity drops) as your approach altitude increases. If you come in from 200km+ altitude, you are *fast* and the rings are *faint*. You have to rely on the HUD arrow and your gut feel. This is the high-risk, high-reward play.

**Air brake**: A new input -- hold the boost button (instead of tapping) during descent to activate an "EM brake" that bleeds speed for accuracy. This costs boost fuel. The decision: do you spend your remaining fuel on more distance (tapping) or on a clean landing (holding)?

**Altitude score modifier**: Landing from a higher peak altitude multiplies the hop score. Peaked at 150km = 1.5x. Peaked at 300km = 2.0x. This rewards players who dare to go high.

**Atmosphere skip**: If you go above 400km and your horizontal velocity exceeds a threshold, you "skip" off the atmosphere like a stone on water. Your trajectory extends dramatically. This is the expert technique for crossing oceans in a single hop. Extremely hard to land accurately, but spectacular when it works.

**Reference**: *Tribes: Ascend*'s skiing -- velocity is a resource you build and spend. High speed = hard to stop. The tension between "go fast" and "stop precisely" is the entire skill curve.

---

## 6. The Interception Question

The original vision includes rival couriers carrying packages you can intercept. This is the most ambitious and most dangerous feature on the roadmap. Here is an honest assessment.

### Why it could work

Single-player games with AI-driven rivals create emergent drama. You are bouncing toward Narita and you see a red dot converging on the same airport. Do you boost harder to beat them? Do you reroute to a different hop to avoid the collision? Suddenly the route-planning game has a dynamic element -- the graph changes because someone else is on it.

**Ghost couriers** (asynchronous replays of other players' runs, a la *Trackmania*) are lower-risk and still create this effect. You see how someone else routed Glasgow-to-Kyoto and you try to beat their time. No networking required.

### Why it might not work (yet)

The game's core loop is not solid enough to add a second agent. When the user says it feels like "an experience, not a game," adding a rival courier does not fix that -- it adds complexity to confusion. Interception mechanics require the player to already have strong spatial intuition about the globe, which the "doesn't feel like Earth" problem currently prevents.

AI rivals also need clear visual communication: "that is an enemy, they are going to that airport, they will get there in approximately 8 seconds." On a globe where the user already finds it disorienting, adding another moving object with its own trail and destination indicator will increase cognitive load.

### My recommendation

**Phase 1 (now)**: No rivals. Fix the core loop and sense of place.

**Phase 2 (after the route system works)**: Add **ghost trails** -- translucent blue trails showing the top 3 routes other players took for the same origin-destination pair. No moving ghosts, just the paths. This teaches players that alternate routes exist and creates implicit competition ("they went through Dubai? I bet I can go through Istanbul faster").

**Phase 3 (if the game finds an audience)**: Add **one** AI rival per session. Not a full courier fleet -- one nemesis. They appear after your 3rd delivery, racing toward the same destination. If they arrive first, you get half points. If you arrive first, you get a "First Arrival" bonus (1.5x). They do not intercept your packages -- they just compete for the same destination. Simple, clear, dramatic.

**Reference**: *Journey*'s anonymous multiplayer -- the other player's presence creates emotion without requiring combat mechanics. *Nidhogg*'s simplicity -- one rival, one axis of competition, maximum tension.

---

## 7. Difficulty Curve: The First Five Minutes

The current onboarding is: game loads, three delivery choices appear, you pick one. There is no guidance on how to aim, how charging works, what the rings mean, or why you are a glowing ball-shaped gopher. The instruction panel explains the charge mechanic, but on mobile Safari with a 9% battery, nobody is reading a text wall.

Here is a concrete onboarding sequence:

### Bounce 0: The Tutorial Bounce (forced, takes 15 seconds)

The game starts you at London Heathrow. A single destination ring glows at Paris CDG -- close, directly visible, impossible to miss. A pulsing prompt says "HOLD TO CHARGE." You hold. A ring around the button fills. The prompt says "RELEASE." You release. You arc gently to Paris. You land in the outer ring. "DELIVERED! +500" fills the screen. Confetti.

No timer. No choice. No combos. Just the raw dopamine hit of charge-launch-land-score.

### Bounce 1-2: Guided Choice (30 seconds)

Now the game offers two choices (not three -- reduce decision paralysis): Amsterdam (short, easy) or Rome (medium). Both are highlighted on the globe with visible trails. The globe auto-rotates to show you where they are relative to Paris. You pick one.

The timer is 45 seconds (extremely generous). You charge, launch, land. If you hit bullseye: "BULLSEYE! 3x BONUS!" If you miss the inner ring: "DELIVERED! Try charging less next time." Gentle coaching, not failure states.

### Bounce 3: Rapid-Tap Introduction (20 seconds)

You launch toward your destination. Mid-flight, a prompt pulses: "TAP TO BOOST!" You tap. The pod surges forward. You feel the difference. "NICE BOOST!" appears. This teaches the most fun mechanic naturally, in context.

### Bounce 4: First Real Delivery (you are on your own)

Three choices appear. Timer is normal. No prompts. The player is now playing the real game. Total tutorial time: ~90 seconds.

### What NOT to do

Do not front-load a text tutorial. Do not explain combos, accuracy tiers, or scoring formulas before the player has bounced once. Do not show the hop-selection radial dial until the player has completed 3 single-hop deliveries. Layer complexity onto a foundation of physical intuition.

**Reference**: *Katamari Damacy*'s opening -- one room, one action, instant comprehension. *Baba Is You*'s first level -- the tutorial IS a level, not a separate thing.

---

## 8. Scoring Redesign

The current formula is:

```
total = (base + timeBonus + distBonus + streakBonus + chainBonus) x accuracyMultiplier x comboMultiplier
```

This has five additive components and two multiplicative components. When a player sees "+4,200 pts" they have no idea why. Was it the combo? The accuracy? The distance? The chain bonus? The score is a number that goes up. It is not *communicating* anything.

### The Problem: Scores Should Teach

Every score popup should tell the player what they did right (or wrong). A 4,200-point delivery that was a bullseye at x3 combo should feel different from a 4,200-point delivery that was a basic delivery on a long-distance route. But right now they are the same number.

### Proposed Redesign: Three Visible Axes

**Accuracy Stars** (0-3): Replace the accuracy multiplier with a star rating visible on each hop. 0 stars = delivered (outer ring). 1 star = precise. 2 stars = bullseye. 3 stars = perfect bullseye (within 0.2 units -- currently not distinguished). These are persistent per-route: "Glasgow to Kyoto: 2/4 hops at 3 stars."

**Route Efficiency** (percentage): How close was your total route distance to the optimal great-circle distance? If the optimal path is 9,000km and you traveled 9,800km, your efficiency is 92%. This teaches players to pick better routes and fly straighter arcs. Display it at route completion.

**Speed Grade** (S/A/B/C/D): Based on total route time vs. par time (computed from the route distance). S = under 60% of par. D = over 150% of par. This is the competitive axis -- the thing speedrunners optimize.

The final score is still a single number (for leaderboards), but the three axes give the player *specific things to improve*. "I got 3 stars on accuracy but only C speed -- I need to boost more in flight." "I got S speed but my route efficiency was 71% -- I took a detour through Cairo."

### Kill The Combo Timer

The 15-second combo timeout is stressful and arbitrary. Replace it with a **route combo**: maintain accuracy across an entire multi-hop route. All hops at bullseye or better = route perfect bonus (2x). Any hop at basic "delivered" = combo broken. This ties the combo to the thing the player cares about (the route), not to an invisible clock.

**Reference**: *Tony Hawk's Pro Skater*'s scoring -- you see each trick's contribution to the combo. The score is decomposable. *Hades*' "heat" system -- the player chooses which difficulty axes to push.

---

## 9. The "One More Game" Factor

This is the most important section. A beautiful game with a solid loop that nobody replays is a tech demo. What makes someone play 10 sessions?

### 9a. The Route Collection

Every completed route (origin-to-destination, with the specific hops taken) is saved to a personal "Route Atlas." The atlas is a globe with your completed routes drawn as colored arcs. Over time, your globe fills with paths. This is the *Strava heatmap* effect: "I have covered 40% of the route graph. What paths am I missing?"

Routes have ratings (based on your star/speed/efficiency scores). You can replay any route to improve your rating. A route you 3-starred at S-speed glows gold on the atlas. The goal: make the whole globe glow.

### 9b. Daily Routes

Each day, one featured route is highlighted: "Today's Route: Lagos to Tokyo." Everyone who plays it gets ranked on a daily leaderboard. This is low-effort to implement (pick a random origin-destination pair from the route graph, seed it with the date) and creates a reason to come back every 24 hours.

**Reference**: *Wordle*'s daily puzzle -- one shared challenge, social comparison, zero obligation.

### 9c. Route Challenges

Hand-designed routes with specific constraints:
- "The Polar Express" -- Anchorage to Oslo via the shortest path that stays above 60 degrees latitude
- "The Equator Run" -- Lagos to Singapore, all hops within 15 degrees of the equator
- "The Altitude Challenge" -- London to Sydney, every hop must peak above 200km
- "Speed Demon" -- New York to Los Angeles in under 60 seconds (only 2 hops!)

These are unlocked progressively and give the game long-tail content without requiring new art or code. They reuse the existing airports and route graph.

### 9d. Unlockable Cosmetics Tied to Mastery

The GameState already has unlockable skins (neon, galaxy, aurora) but they unlock by XP threshold, not by achievement. Tie them to *specific feats*:
- "Aurora" skin: reach 400km altitude and land a bullseye on the same hop
- "Galaxy" skin: complete 10 routes with S-speed
- "Neon" skin: achieve a 5-route perfect combo streak

This turns cosmetics from participation trophies into bragging rights.

### 9e. The Meta-Game: Network Builder

This is the ambitious long-term vision. The player is not just delivering packages -- they are *building a courier network*. Each completed route "activates" that connection in the network. Activated routes generate passive income (1 point per second per active route). But routes degrade over time if not re-flown. You are maintaining a living network.

This transforms the game from "score attack with an ending" to "ongoing network management with no ceiling." The player's globe becomes more connected, more alive, more *theirs*. Losing a route connection (because it degraded) creates the pull to come back and re-fly it.

**Reference**: *Universal Paperclips*' phase transitions -- the game keeps finding new things to care about. *Neko Atsume*'s passive income loop -- the game works even when you are not playing it, and rewards you for coming back.

---

## Summary: The Three Things That Matter Most

If I had to distill this entire critique into three actions, they would be:

1. **Make hops the unit of play, not deliveries.** Each hop is a skill check with its own score. A delivery is a sequence of hops. The route graph structures the sequence. The radial dialog (or pre-selected route) determines which hops you attempt. The arcade and the strategy coexist because they operate at different scales: strategy at the route level, skill at the hop level.

2. **Make altitude a choice with consequences.** High = fast + risky. Low = slow + safe. The player should feel this in the physics, the visuals, AND the score. Right now altitude is a screensaver. It should be a verb.

3. **Give the player a globe that fills up over time.** The Route Atlas, the daily routes, the cosmetic unlocks tied to mastery -- these all serve the same purpose: making the player feel like their *history* with the game matters. A score of 47,000 is forgettable. A globe covered in gold arcs connecting 40 airports is a thing you built. That is the difference between a game you play once and a game you play fifty times.

---

## Appendix: What Is Already Good

It would be irresponsible to write 3,000 words of critique without acknowledging what works.

- The **electromagnetic trampoline aesthetic** is genuinely distinctive. No other game looks like this. The blue-purple-cyan palette, the ring pulses, the magnetic field lines -- this is a strong visual identity. Do not lose it.
- The **20-hub airport selection** with spatial deduplication is smart engineering. The fact that the route graph exists with 13,143 real flight connections is a remarkable data foundation. Most indie games would kill for this kind of grounded-in-reality dataset.
- The **pod character** with eyes, wings, cargo, and squash-stretch animation has charm. It faces the camera when parked (cute!) and faces velocity when flying (functional!). This is good character design from a small set of primitives.
- The **audio layer** (10+ cues including charge growl, bounce pop, delivery chime, wind layer) shows attention to game feel. Sound is often the last thing indie devs add. The fact that it exists already is a strong sign.
- The **camera system** (follow/free/ISS modes, smooth quaternion slerp, dynamic FOV, shake on hard landings) is technically sophisticated and mostly works. The "disorienting" feedback is about the *game's* spatial communication, not the camera's smoothness.

This is a game with a beautiful foundation and a missing floor plan. The rooms are gorgeous but nobody knows which door to walk through next. Build the floor plan -- the route structure, the altitude risk curve, the hop-as-skill-check loop -- and the beauty will finally have a purpose.
