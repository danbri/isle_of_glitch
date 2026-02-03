oooOO`

// ARCADE HUB - Where Machines Dream
// Collect TOKENS. Unlock SECRETS. Become LEGEND.

VAR tokens = 0
VAR diver_beaten = false
VAR roulette_beaten = false
VAR oracle_beaten = false
VAR keeper_beaten = false
VAR secret_found = false
VAR visits = 0

-> start

=== start ===
~ visits = visits + 1
{visits == 1: You push through the static curtain. The ARCADE materializes.|You return. The machines remember.}
{~Neon bleeds through smoke that doesn't exist.|CRT monitors hum their ancient song.|The carpet absorbs your footsteps like hungry moss.|Somewhere, a high score is being erased.}

TOKENS: {tokens} | GAMES MASTERED: {diver_beaten + roulette_beaten + oracle_beaten + keeper_beaten}/4

Four cabinets stand in pools of colored light. A fifth lurks in shadow.

+ [BLUE cabinet - DEPTH DIVER] -> depth_diver_cabinet
+ [RED cabinet - GLITCH ROULETTE] -> roulette_cabinet
+ [GRAY cabinet - THRESHOLD KEEPER] -> keeper_cabinet
+ [GOLD cabinet - MEMORY ORACLE] -> oracle_cabinet
+ {diver_beaten && roulette_beaten && oracle_beaten && keeper_beaten} [The DARK cabinet awakens...] -> secret_cabinet
+ {not (diver_beaten && roulette_beaten && oracle_beaten && keeper_beaten)} [Peer at the shadowed cabinet] -> locked_cabinet
+ [TOKEN SHRINE - View Progress] -> token_shrine
+ [Leave the Arcade] -> leave

=== depth_diver_cabinet ===
The blue cabinet pulses like a deep-sea beacon.
DEPTH DIVER - "How Deep Before You Drown?"
{diver_beaten: [MASTERED - 10 TOKENS CLAIMED]|[UNBEATEN - 10 TOKENS AWAIT]}
{~The joystick is cold as ocean water.|The screen flickers: "DEEPER..."|Previous player's sweat still glistens.}
Scratched into the side: "At depth 5, truth waits. ENQUIRE..."
+ [Play DEPTH DIVER] -> play_depth_diver
+ [Return to floor] -> start

=== play_depth_diver ===
# FINK: games/depth_diver.fink.js
{not diver_beaten:
    ~ diver_beaten = true
    ~ tokens = tokens + 10
    The cabinet ERUPTS! 10 TOKENS cascade into your hands!
}
-> start

=== roulette_cabinet ===
The red cabinet throbs with corrupt energy. Static crawls across its screen.
GLITCH ROULETTE - "Spin. Corrupt. Transcend."
{roulette_beaten: [MASTERED - 15 TOKENS CLAIMED]|[UNBEATEN - 15 TOKENS AWAIT]}
{~Something watches between the segments.|The bet counter twitches without input.|You smell ozone and regret.}
Warning label: "ZALGO ENCOUNTER RATE: 12.5%. 20 STABILITY or 10 GLITCH = VICTORY"
+ [Play GLITCH ROULETTE] -> play_roulette
+ [Return to floor] -> start

=== play_roulette ===
# FINK: games/glitch_roulette.fink.js
{not roulette_beaten:
    ~ roulette_beaten = true
    ~ tokens = tokens + 15
    CORRUPTION TRANSCENDED! 15 TOKENS materialize from static!
}
-> start

=== oracle_cabinet ===
The golden cabinet hums with accumulated wisdom.
MEMORY ORACLE - "Do You Remember? Do You Know?"
{oracle_beaten: [MASTERED - 20 TOKENS CLAIMED]|[UNBEATEN - 20 TOKENS AWAIT]}
{~Ancient eyes blink in the monitor's depths.|The keyboard is warm, as if just used.|Your reflection knows more than you do.}
Golden text: "PERFECT SCORE = TRUE MASTERY. The isle recognizes its own."
+ [Consult the ORACLE] -> play_oracle
+ [Return to floor] -> start

=== play_oracle ===
# FINK: games/memory_oracle.fink.js
{not oracle_beaten:
    ~ oracle_beaten = true
    ~ tokens = tokens + 20
    The Oracle BLAZES! 20 TOKENS rain like golden tears!
}
-> start

=== keeper_cabinet ===
The gray cabinet emanates stillness. Neither warm nor cold.
THRESHOLD KEEPER - "Guard the Balance. Become the Fulcrum."
{keeper_beaten: [MASTERED - 15 TOKENS CLAIMED]|[UNBEATEN - 15 TOKENS AWAIT]}
{~The screen shows a line - perfectly centered.|Entities flicker in the peripheral vision.|You feel the weight of every decision you've never made.}
Etched in the frame: "Neither order nor chaos. EQUILIBRIUM."
+ [Take your position as KEEPER] -> play_keeper
+ [Return to floor] -> start

=== play_keeper ===
# FINK: games/threshold_keeper.fink.js
{not keeper_beaten:
    ~ keeper_beaten = true
    ~ tokens = tokens + 15
    BALANCE ACHIEVED! 15 TOKENS materialize from the threshold!
}
-> start

=== locked_cabinet ===
A fifth cabinet crouches in shadow, wrapped in static.
The screen shows only: "? / 4 MASTERS REQUIRED"
{~It watches you fail to approach.|Something moves behind the glass.|The darkness is patient. The darkness is hungry.}
Beat all four games to unlock the SECRET CABINET.
+ [Not yet worthy...] -> start

=== secret_cabinet ===
The shadows PART. The cabinet reveals itself.
"V O I D . E X E" blazes on screen. No rules. No score. Only TRUTH.
{secret_found: You have already glimpsed what lies within.|The final secret awaits those who ENQUIRE.}
+ {tokens >= 50} [INSERT 50 TOKENS - Enter the Void] -> play_void
+ {tokens < 50} [REQUIRES 50 TOKENS ({tokens}/50)] -> need_tokens
+ [Step back from the abyss] -> start

=== need_tokens ===
The cabinet laughs in frequencies you feel in your teeth.
"COLLECT. RETURN. TRANSCEND." Your count: {tokens}/50
Master the games again. Each replay grants wisdom, if not tokens.
+ [Understood] -> start

=== play_void ===
~ tokens = tokens - 50
~ secret_found = true
The 50 TOKENS dissolve. The screen cracks open.
"Y̷O̵U̸ ̷A̶R̵E̶ ̸T̵H̶E̷ ̸G̴A̵M̷E̶ ̵N̷O̸W̸"
ENQUIRE WITHIN UPON EVERYTHING. The password was never for the isle. It was for YOU.
{~You understand now.|The arcade was always inside you.|The machines bow as one.}
ACHIEVEMENT: ARCADE MASTER - You have become what you played.
+ [Return, transformed] -> start

=== token_shrine ===
A glass case displays your collection. Tokens shimmer with captured light.
TOKENS: {tokens}

ACHIEVEMENTS:
{diver_beaten: [X] DEPTH MASTER - Survived the recursive pool (+10)|[ ] DEPTH MASTER - Beat Depth Diver}
{roulette_beaten: [X] CORRUPTION SAINT - Transcended the wheel (+15)|[ ] CORRUPTION SAINT - Beat Glitch Roulette}
{keeper_beaten: [X] BALANCE KEEPER - Mastered order and chaos (+15)|[ ] BALANCE KEEPER - Beat Threshold Keeper}
{oracle_beaten: [X] ORACLE'S CHOSEN - Proved your knowledge (+20)|[ ] ORACLE'S CHOSEN - Beat Memory Oracle}
{secret_found: [X] VOID WALKER - Entered the final cabinet|[ ] VOID WALKER - ???}
{~The tokens hum with potential.|Each token is a memory made solid.|Progress persists. The arcade remembers.}
+ [Return to floor] -> start

=== leave ===
TOKENS: {tokens} | MASTERED: {diver_beaten + roulette_beaten + oracle_beaten + keeper_beaten}/4
{secret_found: The void whispers goodbye.}
{diver_beaten && roulette_beaten && oracle_beaten && keeper_beaten && not secret_found: All four defeated. Something stirs in shadow...}
{(diver_beaten + roulette_beaten + oracle_beaten + keeper_beaten) == 0: You leave unchanged. Return when ready.}
The arcade hums behind you. The machines dream on.
# FINK: hub.fink.js
-> END

`
