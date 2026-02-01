// DEPTH DIVER - A Recursive Pool Minigame
// How deep can you go before you hit the floor?
// Session 01RBzBHUTVQXUsyNx5xZcFFk

VAR depth = 0
VAR max_depth = 0
VAR has_secret = false
VAR roll = 0

=== start ===

THE RECURSIVE POOL

The water is deep. Infinitely deep, some say.
Others say it has a floor - but only the reckless discover it.

RULES:
- You start at the SURFACE (depth 0)
- Each turn, choose to DIVE DEEPER or SURFACE
- When DIVING: Roll a die (1-6)
  If you roll YOUR DEPTH OR LOWER, you HIT THE FLOOR
- When SURFACING: Safe. Your score = maximum depth reached
- RUMOR: Something waits at depth 5...

+ [Take a breath. Begin.] -> surface
+ [I prefer dry land.] -> coward_ending

=== surface ===
~ depth = 0

You float at the surface. The sun warms your back.
Below, the water darkens into mystery.

Current depth: {depth}
Maximum depth reached: {max_depth}
{has_secret: A secret glows in your pocket.}

+ [DIVE into the depths] -> dive
+ [Stay here. The surface is enough.] -> surface_ending

=== dive ===
~ depth = depth + 1
~ roll = RANDOM(1, 6)
{depth > max_depth: ~ max_depth = depth}

{~The water embraces you.|Pressure builds.|Bubbles rise past your face.|The light fades above.|Darkness welcomes you.|You descend.}

You are now at depth {depth}.
The die tumbles through the water... it shows {roll}.

{roll <= depth: -> hit_floor}

{roll > depth: {~Safe. The floor is not here.|You pass through safely.|No bottom yet.|The abyss continues.|Nothing stops your descent.}}

{depth == 5 && not has_secret: -> find_secret}

+ [DIVE DEEPER - risk everything] -> dive
+ [SURFACE - claim your score] -> ascend

=== find_secret ===
~ has_secret = true

At depth 5, you see it.

A glimmering truth, embedded in the recursive bedrock.
Letters form in the darkness, ancient and knowing:

    E Q U I R E . . .

You grasp it before it fades. The secret is yours.

(+10 BONUS POINTS for discovering what lies beneath)

+ [Continue diving - greedy for more] -> post_secret_dive
+ [SURFACE - you have what you came for] -> ascend

=== post_secret_dive ===
{~"Deeper?" the water asks. "There is always deeper."|The secret burns cold against your chest.|Greed is just curiosity without limits.}

+ [DIVE DEEPER] -> dive
+ [SURFACE NOW] -> ascend

=== hit_floor ===

You rolled {roll}. Your depth was {depth}.

The floor finds you.

{depth == 1: {~A shallow grave.|You barely submerged.|The floor was right there.}}
{depth == 2: {~Too eager, too soon.|The second layer claims you.|Hubris at depth two.}}
{depth == 3: {~Three is not always magic.|The third depth takes its toll.|Triangles have sharp edges.}}
{depth == 4: {~Four corners of a coffin.|Quaternity: earth, air, fire, floor.|The fourth way down was the last.}}
{depth == 5: {~The secret depth becomes your tomb.|Five - the hand closes.|So close to everything.}}
{depth >= 6: {~The deep ones welcome you.|Past five, past hope, past breath.|You found what no one returns from.}}

DROWNED at depth {depth}.
Maximum depth reached: {max_depth}
{has_secret: You clutch the secret even in death. (The letters spell: ENQUIRE WITHIN UPON EVERYTHING)}

+ [Float back to try again] -> start

=== ascend ===

You rise.

{depth == 1: One stroke and you breach the surface.}
{depth == 2: Two depths overcome. The light returns quickly.}
{depth == 3: Three layers of pressure release. Your ears pop.}
{depth == 4: Four fathoms of ascent. The sun grows brighter.}
{depth == 5: Five depths conquered. The secret pulses with each stroke.}
{depth >= 6: From impossible depths, you claw toward light. Heroes are made in the return.}

{~The surface breaks around you.|Air fills your lungs.|You emerge, triumphant.|Sunlight crowns your head.}

-> victory

=== victory ===

SURFACED!

You gasp at the edge of the pool.

FINAL SCORE:
- Maximum depth reached: {max_depth}
- Base score: {max_depth} x 10 = {max_depth * 10} points
{has_secret: - SECRET BONUS: +10 points}
{has_secret: - TOTAL: {max_depth * 10 + 10} points}
{not has_secret: - TOTAL: {max_depth * 10} points}

{max_depth == 0: You never dove. Wisdom or cowardice?}
{max_depth == 1: Toe-dipper. The pool barely knows you.}
{max_depth == 2: Wader. You felt the chill.}
{max_depth == 3: Swimmer. Respectable.}
{max_depth == 4: Diver. The deep has marked you.}
{max_depth == 5: Master Diver. You touched the secret layer.}
{max_depth >= 6: Abyssal Explorer. Few return from such depths.}

{has_secret && max_depth >= 5: The secret whispers its full name to those who return: ENQUIRE WITHIN UPON EVERYTHING. Use it wisely.}

+ [Dive again - chase a higher score] -> start
+ [Walk away from the pool] -> final_exit

=== surface_ending ===

You float.

The depths call, but you do not answer.
There is wisdom in restraint. Or perhaps fear.

SCORE: 0 points
(You never dove. The floor never found you.)

+ [Actually, dive after all] -> dive
+ [Leave the pool forever] -> final_exit

=== coward_ending ===

The pool shimmers, untouched.

You remain dry. You remain safe. You remain... unaware.

What lies at depth 5? You will never know.

SCORE: 0 points (COWARDICE PENALTY)

+ [Reconsider - approach the pool] -> start
+ [Walk away] -> final_exit

=== final_exit ===

You leave the recursive pool behind.

{max_depth >= 5 && has_secret: The secret follows you: ENQUIRE WITHIN UPON EVERYTHING.}
{max_depth >= 3 && not has_secret: You remember the pressure, the darkness, the gamble.}
{max_depth < 3: The pool forgets you immediately.}

The water stills.
It waits for the next diver.

Final statistics:
- Deepest dive: {max_depth}
- Secret found: {has_secret}
- Status: SURVIVED

Perhaps another will dare what you dared.
Perhaps another will go deeper.

The pool is patient.
The pool is deep.
The floor is always waiting.

-> END
