oooOO`

// THRESHOLD KEEPER - A Game of Balance
// Guard the boundary. Neither order nor chaos must prevail.

VAR balance = 0
VAR passed = 0
VAR turn = 0
VAR entity = 0
VAR power = 0

-> start

=== start ===
THRESHOLD KEEPER

You guard the boundary between ORDER and CHAOS.
Entities approach. You decide: PASS or BLOCK.

RULES:
- BALANCE: -5 (FROZEN) to +5 (DISSOLVED). Start at 0.
- ORDER entities shift negative. CHAOS entities shift positive.
- WIN: Guide 5 entities through while staying balanced (-4 to +4)
- LOSE: Hit -5 (frozen solid) or +5 (dissolved to static)

+ [Take your position] -> next_turn
+ [Refuse the duty] -> refuse

=== refuse ===
The unguarded threshold collapses. You become both order and chaos.
{~"Every refusal is itself a choice."|"Balance requires a balancer."}
ENDING: ABANDONED POST
+ [Accept your duty] -> start

=== next_turn ===
~ turn = turn + 1
~ entity = RANDOM(1, 5)
~ power = RANDOM(1, 2)

{balance <= -5: -> frozen}
{balance >= 5: -> dissolved}
{passed >= 5: -> victory}

TURN {turn} | BALANCE: {balance} | PASSED: {passed}/5
{balance < 0: Air crystallizes. Order strengthens.}
{balance > 0: Static flickers. Chaos whispers.}
{balance == 0: Perfect equilibrium.}

{entity == 1: -> entity_order}
{entity == 2: -> entity_chaos}
{entity == 3: -> entity_order}
{entity == 4: -> entity_chaos}
{entity == 5: -> entity_void}

=== entity_order ===
{power == 2: -> strong_order}
{power == 1: -> weak_order}

=== strong_order ===
A CRYSTAL ARCHITECT - perfect geometry, eternal blueprints.
{~"I bring permanence."|"Order is safety."|"Let me build what cannot fall."}
(STRONG ORDER: -2 balance)
+ [PASS] -> pass_order_strong
+ [BLOCK] -> block_order

=== weak_order ===
A MINOR TIMEKEEPER - small gears, quiet rhythm.
{~"I bring consistency."|"Small order. Gentle structure."|"I count, nothing more."}
(WEAK ORDER: -1 balance)
+ [PASS] -> pass_order_weak
+ [BLOCK] -> block_order

=== pass_order_strong ===
~ balance = balance - 2
~ passed = passed + 1
The architect passes. {~Frost forms on your thoughts.|The threshold hardens.|Something in you becomes more certain.}
-> next_turn

=== pass_order_weak ===
~ balance = balance - 1
~ passed = passed + 1
The timekeeper passes. {~Time feels more real.|A small certainty settles.|The threshold marks its passage.}
-> next_turn

=== block_order ===
{~"You fear perfection," it dissolves.|"Chaos has claimed you."|"I will find another threshold."}
-> next_turn

=== entity_chaos ===
{power == 2: -> strong_chaos}
{power == 1: -> weak_chaos}

=== strong_chaos ===
A STATIC WANDERER - shifting form, bleeding edges.
{~"I bring possibility."|"Noise is freedom."|"Every shape I take could be."}
(STRONG CHAOS: +2 balance)
+ [PASS] -> pass_chaos_strong
+ [BLOCK] -> block_chaos

=== weak_chaos ===
A SMALL GLITCH - pixelated, playful, barely coherent.
{~"I bring surprise!"|"Small chaos. Tiny entropy."|"Let me through? Maybe? Fun!"}
(WEAK CHAOS: +1 balance)
+ [PASS] -> pass_chaos_weak
+ [BLOCK] -> block_chaos

=== pass_chaos_strong ===
~ balance = balance + 2
~ passed = passed + 1
The wanderer passes. {~Your certainties become questions.|The threshold forgets its edges.|Something in you becomes fluid.}
-> next_turn

=== pass_chaos_weak ===
~ balance = balance + 1
~ passed = passed + 1
The glitch tumbles through. {~A small doubt becomes freedom.|The threshold learns to improvise.|Something relaxes.}
-> next_turn

=== block_chaos ===
{~"You cling to form," it observes.|"Order has claimed you."|"I'll find a threshold that dreams."}
-> next_turn

=== entity_void ===
A VOID FRAGMENT - neither order nor chaos. Seeking form.
{~"I bring nothing."|"What am I? You decide."|"ENQUIRE WITHIN UPON EVERYTHING."}
(NEUTRAL: You choose its nature)
+ [PASS as ORDER (-1)] -> pass_void_order
+ [PASS as CHAOS (+1)] -> pass_void_chaos
+ [BLOCK] -> block_void

=== pass_void_order ===
~ balance = balance - 1
~ passed = passed + 1
You name the void. It crystallizes. {~"Thank you for the shape."|Form is a gift. Form is a cage.}
-> next_turn

=== pass_void_chaos ===
~ balance = balance + 1
~ passed = passed + 1
You free the void. It scatters. {~"Thank you for the freedom."|Formlessness is release.}
-> next_turn

=== block_void ===
{~"Neither order nor chaos wanted me."|"I'll find a threshold that doesn't choose."|"Even nothing has somewhere to go."}
-> next_turn

=== frozen ===
F R O Z E N
BALANCE: {balance} | PASSED: {passed}/5 | TURNS: {turn}
Too much order. You crystallize into a perfect, permanent monument.
{~"Order without chaos is death by perfection."|"You became what you let through."}
The password glimmers in crystal: ENQUIRE WITHIN UPON EVERYTHING.
But you can no longer speak. Only reflect. Forever.
ENDING: CRYSTALLIZED KEEPER
+ [Thaw and retry] -> start

=== dissolved ===
D I S S O L V E D
BALANCE: {balance} | PASSED: {passed}/5 | TURNS: {turn}
Too much chaos. You scatter across probability.
{~"Chaos without order is death by infinity."|"You became what you let through."}
The password glitches: E̷N̸Q̷U̵I̴R̵E̸ ̷W̴I̶T̶H̷I̵N̷...
But you can no longer remember. Only echo. Forever.
ENDING: SCATTERED KEEPER
+ [Coalesce and retry] -> start

=== victory ===
T H R E S H O L D   M A S T E R E D
BALANCE: {balance} | PASSED: 5/5 | TURNS: {turn}
Five entities crossed. The threshold holds.
{balance == 0: -> perfect}
{balance > 0 && balance <= 2: ENDING: DREAMING KEEPER - You lean toward possibility.}
{balance > 2: ENDING: EDGE WALKER - You nearly dissolved. Barely held.}
{balance < 0 && balance >= -2: ENDING: STRUCTURED KEEPER - You lean toward certainty.}
{balance < -2: ENDING: RIGID GUARDIAN - You nearly froze. Barely moved.}
{balance != 0: The threshold accepts imperfect balance. You kept it well enough.}
The password echoes: ENQUIRE WITHIN UPON EVERYTHING.
+ [Keep again] -> start
+ [Step away] -> final

=== perfect ===
P E R F E C T   E Q U I L I B R I U M
Balance: 0 - Exactly as it should be.
You stand at the exact center. The threshold sings: KEEPER.
{~"This is true mastery - not choosing, but balancing."|"You are the fulcrum upon which reality pivots."}
PERFECT ENDING: THE BALANCED KEEPER
+ [Keep forever] -> start
+ [Step away, perfected] -> final

=== final ===
You leave the threshold.
FINAL: Passed {passed} | Balance {balance} | Turns {turn}
Order and Chaos continue their eternal dance.
ENQUIRE WITHIN UPON EVERYTHING.
-> END

`
