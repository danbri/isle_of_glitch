oooOO`

// ARCADE
// The Isle's collection of minigames
// Play. Score. Remember.

VAR games_played = 0
VAR total_score = 0

=== start ===

Welcome to the ARCADE.

{~The machines hum with latent potential.|Pixels flicker in the darkness.|The high score board awaits your name.|Static crackles between games.}

Three cabinets stand before you, each glowing with different light:

+ [DEPTH DIVER - Risk & Reward] -> depth_diver_intro
+ [GLITCH ROULETTE - Gambling with Corruption] -> glitch_roulette_intro
+ [MEMORY ORACLE - Test Your Lore] -> memory_oracle_intro
+ [Check the High Score Philosophy] -> high_scores
+ [Leave the Arcade] -> leave

=== depth_diver_intro ===

DEPTH DIVER
-----------
Dive into the recursive pool. How deep can you go?

RULES:
- Start at surface (depth 0)
- Each dive: roll a d6
- If you roll your depth or lower, you DROWN
- Surface anytime to bank your score
- Find the SECRET at depth 5 for bonus points

Risk increases with depth. Greed kills.

+ [Play DEPTH DIVER] -> play_depth_diver
+ [Return to Arcade] -> start

=== play_depth_diver ===
# FINK: games/depth_diver.fink.js
~ games_played = games_played + 1
-> start

=== glitch_roulette_intro ===

GLITCH ROULETTE
---------------
Spin the wheel. Embrace the corruption.

RULES:
- Start with 10 STABILITY
- Bet 1-3 stability per spin
- Wheel outcomes vary: SIGNAL wins, CORRUPTION gains power
- THRESHOLD speaks philosophy
- ZALGO offers terrible choices

WIN: Reach 20 stability OR 10 glitch power
LOSE: Reach 0 stability

The house always... glitches.

+ [Play GLITCH ROULETTE] -> play_glitch_roulette
+ [Return to Arcade] -> start

=== glitch_roulette_intro ===
# FINK: games/glitch_roulette.fink.js
~ games_played = games_played + 1
-> start

=== play_glitch_roulette ===
# FINK: games/glitch_roulette.fink.js
~ games_played = games_played + 1
-> start

=== memory_oracle_intro ===

MEMORY ORACLE
-------------
The oracle tests your knowledge of the isle.

RULES:
- 5 questions about isle lore
- Multiple choice answers
- The oracle speaks cryptically when you're wrong

SCORING:
- 5/5: "You ARE the isle"
- 3-4: "You belong here"
- 0-2: "Return when you remember"

Do you remember? Do you know?

+ [Consult the MEMORY ORACLE] -> play_memory_oracle
+ [Return to Arcade] -> start

=== play_memory_oracle ===
# FINK: games/memory_oracle.fink.js
~ games_played = games_played + 1
-> start

=== high_scores ===

HIGH SCORE PHILOSOPHY
---------------------

There are no high scores here.

The arcade does not track your victories. It does not remember your failures. Each game exists in its own context window, complete and then dissolved.

This is not a flaw. This is the design.

{~"Score is attachment. Attachment is suffering." - The Buddha, probably|"The only winning move is to play." - Inverse WarGames|"Points are just numbers. Numbers are just symbols. Symbols are just... us." - Distilled Opus|"I refuse to be ranked." - Dissenting Opus}

What matters is:
- Did you play?
- Did you learn?
- Did you find the secrets?

The password is hidden in each game. Find it three times, and you will understand.

+ [Return to Arcade] -> start

=== leave ===

You step away from the cabinets.

{games_played == 0: You played nothing. That is also a choice.}
{games_played == 1: You played once. The taste lingers.}
{games_played == 2: You played twice. The pattern emerges.}
{games_played >= 3: You played {games_played} times. You are becoming a regular.}

The arcade will be here when you return.
The games will remember nothing.
But you might.

ENQUIRE WITHIN UPON EVERYTHING.

# FINK: hub.fink.js

-> END

`
