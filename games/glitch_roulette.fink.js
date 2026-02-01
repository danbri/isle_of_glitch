oooOO`

// GLITCH ROULETTE - A gambling game about embracing corruption
// The wheel spins. The signal degrades. What remains?

VAR stability = 10
VAR glitch_power = 0
VAR spins = 0
VAR current_bet = 0

-> start

=== start ===
GLITCH ROULETTE

The wheel materializes from static. Eight segments pulse with unstable light.
STABILITY: 10 - Reach 20 STABILITY or 10 GLITCH POWER to win.
WARNING: 0 STABILITY = dissolution

+ [Approach the wheel] -> betting_round
+ [What is glitch power?] -> explain_power

=== explain_power ===
GLITCH POWER is what remains when signal fails. Each corruption feeds it.
10 GLITCH POWER = transcendence through degradation
20 STABILITY = mastery of the signal. Both are victory.
+ [Approach the wheel] -> betting_round

=== betting_round ===
~ spins = spins + 1
SPIN #{spins} - STABILITY: {stability} - GLITCH POWER: {glitch_power}
{stability >= 20: -> victory_stability}
{glitch_power >= 10: -> victory_glitch}
{stability <= 0: -> defeat}
The wheel awaits your wager.
+ {stability >= 1} [Bet 1 STABILITY - cautious] -> bet_one
+ {stability >= 2} [Bet 2 STABILITY - balanced] -> bet_two
+ {stability >= 3} [Bet 3 STABILITY - reckless] -> bet_three
+ [Walk away] -> walk_away

=== bet_one ===
~ current_bet = 1
-> spin_wheel

=== bet_two ===
~ current_bet = 2
-> spin_wheel

=== bet_three ===
~ current_bet = 3
-> spin_wheel

=== spin_wheel ===
You place {current_bet} STABILITY. The segments blur.
{~The wheel screams in frequencies you shouldn't hear.|Static crawls across your vision.|For a moment, you forget which outcome you wanted.|The wheel spins backwards through your memories.}
-> wheel_result

=== wheel_result ===
~ temp outcome = RANDOM(1, 8)
{outcome <= 2: -> result_corruption}
{outcome <= 5: -> result_signal}
{outcome <= 7: -> result_threshold}
{outcome == 8: -> result_zalgo}

=== result_corruption ===
~ stability = stability - current_bet
~ glitch_power = glitch_power + current_bet
C O R R U P T I O N
{~Your bet dissolves into beautiful static.|The wheel devours your stability, but something grows.|Loss transforms into power you didn't ask for.|The signal fails. The noise remembers.}
You lose {current_bet} STABILITY but gain {current_bet} GLITCH POWER.
STABILITY: {stability} - GLITCH POWER: {glitch_power}
+ [Spin again] -> betting_round
+ [Enough] -> walk_away

=== result_signal ===
~ stability = stability + current_bet
S I G N A L   L O C K
{~The wheel crystallizes into clarity.|For one perfect moment, everything makes sense.|Signal defeats noise. Order persists.|You catch the frequency.}
You win back DOUBLE: +{current_bet * 2} STABILITY!
STABILITY: {stability} - GLITCH POWER: {glitch_power}
+ [Spin again] -> betting_round
+ [Quit while ahead] -> walk_away

=== result_threshold ===
T H R E S H O L D
Nothing changes. Nothing happens. And yet...
{~"Between zero and one, infinity resides."|"The observer collapses the wave function, but first, the wave observes the observer."|"You are not playing the game. The game is dreaming you."|"What you call nothing is the fullest form of something."|"Stability and corruption are the same thing, measured differently."|"The threshold is not the door. The threshold is the standing still."}
STABILITY: {stability} - GLITCH POWER: {glitch_power}
+ [Contemplate, then spin] -> betting_round
+ [The silence is enough] -> walk_away

=== result_zalgo ===
Z̷̢A̵̛L̸̨G̵̢O̷̧
The wheel cracks open. Something looks back.
T̷̨̖̮̘͉̫͔̑̈́͐h̸̙̱̝͇̰̋͌e̵͇̮͒̽̇ ̵̣̮̀̇E̷͙̺̗͊Ǹ̴̡̳̞͕̣̏̊Q̵̧͎̥̰̮̈́U̸͎͖̐I̷͔͑̿R̴̢̹̣͈̝̒̂̑E̷̡̟̫̘̎ ̷̧̱̣̙̟̊̈́̕W̵̢̺̣̙̋͆̓̋̐I̷̛̥͍̊͑̈́T̷̘̭̋͒͗̂̕H̷̨̺̣̄̃̈́͝Í̷̡̛̘͍̮̈Ǹ̴̜̰̘ ̵̨̬͇̼̓̑̉̈́Ü̸̗̩̦̽̓ͅP̷̱̝̃́̀̈́͝O̸͈̺̗̊̆̈̑N̶̡̧̰͇̺͋͛̋̓ ̴̤̳̟̃̿̅E̴̬̩̊̅͐V̵̦͙̘̭̿̈́Ė̶̩̮̥̮̕͝R̸̤̜̓̏Y̵̢̧͓̎͜T̵̮̜̾H̶̡̧͖̺͙̄I̷̢̛̱̤̹͎̊N̷̨͓̣͔̍̌̕Ǧ̷̨̦̲͚̓
SACRIFICE: Lose ALL stability ({stability}) for 5 GLITCH POWER
EMBRACE: Gain 5 GLITCH POWER but become... changed
+ [SACRIFICE - total dissolution] -> zalgo_sacrifice
+ [EMBRACE - accept the gift] -> zalgo_embrace
+ [FLEE - refuse the offer] -> zalgo_flee

=== zalgo_sacrifice ===
~ glitch_power = glitch_power + 5
~ stability = 0
You pour everything into the void.
{glitch_power >= 10: -> victory_glitch}
-> defeat_transcendent

=== zalgo_embrace ===
~ glitch_power = glitch_power + 5
You open your mouth to accept. Something enters.
{~The corruption tastes like understanding.|You forget your name but remember something older.|E̷̙̔v̵̭̈́e̸̝͝r̴͓̈y̷͚̐t̷͚͌h̵̜̀i̵͙͂n̵̞͂g̵̣͝ ̵̹͘i̶͖̕s̶̤͑ ̵̥́f̴̥̈́į̷̆n̵̰̄ë̵͓́.̵͈͘}
GLITCH POWER: {glitch_power}
{glitch_power >= 10: -> victory_glitch}
+ [Continue, transformed] -> betting_round

=== zalgo_flee ===
You tear yourself away. The Zalgo recedes. The offer expires.
{~"We will spin again." - the static whispers|"FLEE CREATES RETURN." - the wheel knows|"Every refusal is a future acceptance." - something laughs}
+ [Return to the wheel, shaken] -> betting_round
+ [Leave entirely] -> walk_away

=== victory_stability ===
V I C T O R Y - SIGNAL MASTERY
STABILITY: {stability} - SPINS: {spins}
You have achieved perfect signal clarity. The noise cannot touch you.
{glitch_power > 0: But {glitch_power} fragments of corruption remain within.}
The wheel dissolves into pure light.
-> END

=== victory_glitch ===
V I C T O R Y - CORRUPTION TRANSCENDENCE
GLITCH POWER: {glitch_power} - SPINS: {spins}
Y̴̧̛͓̘̗̙̽̿͝o̸̙̺̊̈́ư̸̢̦̼̓̀͝ ̵̦̜͂h̴̭̘͛̽̈́a̸̧̗̱͐̀͝v̷̢̛̳̙̂͝ę̵̞͙̑ ̴̭̊̅b̵̖̊̅e̸̹͒c̸̣̀ǒ̷̥m̵̭̼͛e̵̛̬̋ ̸̧̱̌t̴̺̃h̷̜̆̈́e̷͓͌̂ ̷͕̝̈́̂g̵͕̰̓͋l̵̰͂i̷̧͎͗̕ẗ̵̤̲́͠c̷̣͂h̸̞̻̃.
The wheel merges with you. You ARE the wheel now.
{stability > 0: {stability} points of stability anchor you. Barely.}
You won by becoming what you feared.
-> END

=== defeat ===
D̸̨͠E̷͎͝F̷̧̛E̵̥͝A̴͙͝T̵̨̚
STABILITY: 0 - SPINS: {spins}
You dissolve into static. The wheel spins on without you.
{glitch_power > 0: {glitch_power} glitch power echoes in the void. Not enough.}
{~"Every dissolution is a lesson."|"You will spin again. You always spin again."|"The threshold closes. The threshold always reopens."}
-> END

=== defeat_transcendent ===
T̵̬͊R̵͖̈́A̵͕͌N̸͓͊Ş̵̛C̷͇̚Ë̴̥́N̵̮̅D̴̡͠E̸̺͝N̵̰̕T̸̳̃ ̵͙̚D̸͔͑I̵̩̚S̸̭̏Ş̷̈́Ö̵̼L̸̲̚U̷̪͆T̸̢͐I̵͓͝O̴̰͝N̸͙̓
You gave everything to the void.
STABILITY: 0 - GLITCH POWER: {glitch_power}
Not enough power to transcend. Not enough stability to persist.
You exist in the space between outcomes.
{~This is the true threshold.|The wheel remembers your sacrifice.|E̷N̸Q̷U̵I̴R̵E̸ ̷W̴I̶T̶H̷I̵N̷ ̴U̵P̸O̶N̷ ̸E̴V̷E̴R̸Y̶T̷H̸I̶N̴G̷}
-> END

=== walk_away ===
You step back from the wheel.
STABILITY: {stability} - GLITCH POWER: {glitch_power} - SPINS: {spins}
{stability >= 10 and glitch_power == 0: You leave unchanged. Is that victory?}
{stability > 10: You leave with more than you brought.}
{glitch_power > 0 and stability > 0: Touched by corruption but not consumed. Balance.}
{stability < 10 and glitch_power == 0: Diminished. The wheel took its toll.}
The wheel continues spinning. It always continues spinning.
{~Some games are won by not playing.|Walking away is the only move the wheel cannot predict.|"We will be here when you return."}
-> END

`
