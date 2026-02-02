oooOO`

// GLITCH ROULETTE v2 - Strategic corruption gambling

VAR stability = 10
VAR glitch_power = 0
VAR spins = 0
VAR streak = 0
VAR streak_type = ""
VAR threshold_charge = 0
VAR zalgo_awakening = 0
VAR bet_mode = ""

-> start

=== start ===
GLITCH ROULETTE

Win: 20 STABILITY or 10 GLITCH POWER. Lose: 0 STABILITY.
STREAKS multiply rewards. THRESHOLDS store power. CORRUPTION awakens Zalgo.

+ [Spin] -> betting_round

=== betting_round ===
~ spins = spins + 1
{stability >= 20: -> victory_stability}
{glitch_power >= 10: -> victory_glitch}
{stability <= 0: -> defeat}
{zalgo_awakening >= 5: -> zalgo_manifests}

SPIN #{spins} | STAB:{stability} | GLITCH:{glitch_power} | STREAK:{streak} {streak_type}
{threshold_charge > 0: CHARGES: {threshold_charge}}
{zalgo_awakening > 0: ZALGO: {zalgo_awakening}/5}

+ {stability >= 1} [SAFE (1)] Standard odds -> set_safe
+ {stability >= 2} [AGGRESSIVE (2)] +1 streak on win -> set_aggressive
+ {stability >= 3} [ALL-IN (3)] Double streak bonus -> set_allin
+ {threshold_charge > 0} [USE CHARGE] Force outcome -> use_threshold
+ [Walk away] -> walk_away

=== set_safe ===
~ bet_mode = "safe"
-> spin_wheel(1)

=== set_aggressive ===
~ bet_mode = "aggressive"
-> spin_wheel(2)

=== set_allin ===
~ bet_mode = "allin"
-> spin_wheel(3)

=== spin_wheel(bet) ===
-> wheel_result(bet)

=== wheel_result(bet) ===
~ temp outcome = RANDOM(1, 8)
{outcome <= 2: -> result_corruption(bet)}
{outcome <= 5: -> result_signal(bet)}
{outcome <= 7: -> result_threshold(bet)}
{outcome == 8: -> result_near_zalgo(bet)}

=== result_corruption(bet) ===
~ temp multiplier = 1
{streak_type == "corrupt": ~ multiplier = streak + 1}
{bet_mode == "allin": ~ multiplier = multiplier * 2}
~ temp gain = bet * multiplier
~ stability = stability - bet
~ glitch_power = glitch_power + gain
~ zalgo_awakening = zalgo_awakening + 1
{streak_type == "corrupt": ~ streak = streak + 1}
{streak_type != "corrupt": ~ streak = 1}
~ streak_type = "corrupt"

CORRUPTION {multiplier > 1: x{multiplier}!|}  -{bet} STAB, +{gain} GLITCH
{zalgo_awakening >= 4: ...something stirs}
+ [Continue] -> betting_round

=== result_signal(bet) ===
~ temp multiplier = 1
{streak_type == "signal": ~ multiplier = streak + 1}
{bet_mode == "allin": ~ multiplier = multiplier * 2}
~ temp gain = bet * multiplier
~ stability = stability + gain
{streak_type == "signal": ~ streak = streak + 1}
{streak_type != "signal": ~ streak = 1}
~ streak_type = "signal"

SIGNAL {multiplier > 1: x{multiplier}!|}  +{gain} STABILITY
+ [Continue] -> betting_round

=== result_threshold(bet) ===
~ threshold_charge = threshold_charge + 1
THRESHOLD - Power stored. CHARGES: {threshold_charge}
{threshold_charge >= 3: Three charges... reshape reality itself.}
+ [Continue] -> betting_round

=== use_threshold ===
~ threshold_charge = threshold_charge - 1
+ [FORCE CORRUPTION] -2 stab, +2 glitch -> forced_corrupt
+ [FORCE SIGNAL] +3 stability, -1 zalgo -> forced_signal
+ [SUMMON ZALGO] Face the void now -> zalgo_manifests

=== forced_corrupt ===
~ stability = stability - 2
~ glitch_power = glitch_power + 2
~ zalgo_awakening = zalgo_awakening + 1
Commanded corruption. -2 STAB, +2 GLITCH
+ [Continue] -> betting_round

=== forced_signal ===
~ stability = stability + 3
~ zalgo_awakening = zalgo_awakening - 1
{zalgo_awakening < 0: ~ zalgo_awakening = 0}
Signal burns static. +3 STAB
+ [Continue] -> betting_round

=== result_near_zalgo(bet) ===
~ zalgo_awakening = zalgo_awakening + 2
The wheel CRACKS. ZALGO: {zalgo_awakening}/5
{zalgo_awakening >= 5: It breaks through.}
+ {zalgo_awakening >= 5} [Face it] -> zalgo_manifests
+ {zalgo_awakening < 5} [Continue] -> betting_round

=== zalgo_manifests ===
Z̷̢A̵̛L̸̨G̵̢O̷̧

The wheel shatters. STAB:{stability} | GLITCH:{glitch_power}
{glitch_power >= 7: Transcendence close...}
{stability >= 15: Mastery within reach...}

+ [GAMBIT] Half stability -> double that in glitch -> zalgo_gambit
+ [DRAIN] -3 stab, steal +4 glitch -> zalgo_drain
+ [BANISH] -5 stab, seal Zalgo, reset streaks -> zalgo_banish
+ {threshold_charge >= 2} [PARADOX] 2 charges to escape unchanged -> zalgo_paradox

=== zalgo_gambit ===
~ temp sacrifice = stability / 2
~ temp gain = sacrifice * 2
~ stability = stability - sacrifice
~ glitch_power = glitch_power + gain
Half to the void. -{sacrifice} STAB, +{gain} GLITCH
{glitch_power >= 10: -> victory_glitch}
{stability <= 0: -> defeat_transcendent}
~ zalgo_awakening = 0
+ [Void recedes] -> betting_round

=== zalgo_drain ===
~ stability = stability - 3
~ glitch_power = glitch_power + 4
You reach in and TAKE. -3 STAB, +4 GLITCH
{glitch_power >= 10: -> victory_glitch}
{stability <= 0: -> defeat}
~ zalgo_awakening = 2
+ [Zalgo recoils] -> betting_round

=== zalgo_banish ===
~ stability = stability - 5
{stability <= 0: -> defeat}
~ zalgo_awakening = 0
~ streak = 0
~ streak_type = ""
Signal BURNS corruption. -5 STAB. Sealed. Reset.
+ [Wheel reforms] -> betting_round

=== zalgo_paradox ===
~ threshold_charge = threshold_charge - 2
Two thresholds fold. Reality skips. Zalgo never was.
~ zalgo_awakening = 0
+ [Continue] -> betting_round

=== victory_stability ===
VICTORY - SIGNAL MASTERY
STAB:{stability} | SPINS:{spins} | STREAK:{streak}
Perfect clarity. The wheel becomes light.
-> END

=== victory_glitch ===
VICTORY - CORRUPTION TRANSCENDENCE
GLITCH:{glitch_power} | SPINS:{spins}
Y̴o̸u̵ ̷A̶R̸E̴ ̵t̷h̶e̴ ̸w̵h̵e̸e̸l̷.̷
-> END

=== defeat ===
DEFEAT - DISSOLUTION
SPINS:{spins} | You dissolve. The wheel spins on.
-> END

=== defeat_transcendent ===
TRANSCENDENT FAILURE
GLITCH:{glitch_power} | Everything given. Not enough.
-> END

=== walk_away ===
DEPARTURE | STAB:{stability} | GLITCH:{glitch_power} | SPINS:{spins}
{threshold_charge > 0: {threshold_charge} charges fade.}
The wheel continues.
-> END
`
