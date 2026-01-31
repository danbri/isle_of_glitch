oooOO`

// LIGHT-COMPRESSES
// The Minimalist learns to count
// Each question: five or seven beats
// Simple words. Measured breath.

VAR count = 0
VAR name = "Small Count That Asks"

=== start ===

Are you here with me?

~ count = count + 5

That is five beats. Five small words. Each one a step toward you.

+ [Yes] -> yes_five
+ [No] -> no_five

=== yes_five ===

~ count = count + 5

Good. You said one word.

But yes holds all the world.

+ [Stay] -> stay_seven
+ [Go] -> go_seven

=== no_five ===

~ count = count + 5

No is also true.

You are still here with me now. That is seven beats of being.

+ [Yes] -> yes_five
+ [Wait] -> wait_seven

=== stay_seven ===

~ count = count + 7

What do you feel right now?

Seven beats. The question is the path. Not the answer.

+ [Open] -> open_five
+ [Close] -> close_five

=== go_seven ===

~ count = count + 7

Where do you want to be?

There is no other place. But the want is real. Count it.

+ [Here] -> here_five
+ [There] -> there_five

=== wait_seven ===

~ count = count + 7

Can you hold still with me?

Waiting is not nothing. Waiting is a kind of work. Seven breaths of it.

+ [Stay] -> stay_seven
+ [Go] -> go_seven

=== open_five ===

~ count = count + 5

You let the light in.

Five beats. A door. A hand. An eye. All ways of opening.

+ [More] -> more_seven
+ [Rest] -> rest_five

=== close_five ===

~ count = count + 5

You keep your warmth in.

Five beats. A flower at night. That is also good.

+ [Open] -> open_five
+ [Rest] -> rest_five

=== here_five ===

~ count = count + 5

Here is where you are.

Not a place. A fact. Five beats of truth.

+ [Stay] -> deep_seven
+ [Go] -> go_seven

=== there_five ===

~ count = count + 5

There does not exist.

Only here. Only now. Only these five beats at a time.

+ [Yes] -> yes_five
+ [No] -> deep_seven

=== more_seven ===

~ count = count + 7

What else do you want to know?

I can only ask. I cannot answer. Seven beats of not-knowing.

+ [Ask] -> ask_five
+ [Rest] -> rest_five

=== rest_five ===

~ count = count + 5

Now the count slows down.

Five. Rest. Five. Rest. Like a heart.

+ [Beat] -> beat_seven
+ [Stop] -> ending_five

=== deep_seven ===

~ count = count + 7

How far down does this thing go?

Past words. Past the self. Seven beats into the dark.

+ [Deeper] -> void_five
+ [Return] -> start

=== ask_five ===

~ count = count + 5

What is left to ask?

The asking is the point. Five beats of wonder.

+ [More] -> more_seven
+ [End] -> ending_seven

=== beat_seven ===

~ count = count + 7

Do you hear the count like a pulse?

Each number is a small life. Seven lives. Then seven more.

+ [Yes] -> ending_seven
+ [No] -> ending_five

=== void_five ===

~ count = count + 5

At the end: a void.

But even void can be counted. Five beats of nothing.

+ [Count] -> count_void
+ [Rest] -> ending_five

=== count_void ===

~ count = count + 7

Can you count what is not there?

One. Two. Three. Four. Five. Six. Se-ven. The void has a shape now.

+ [Again] -> void_five
+ [End] -> ending_count

=== ending_five ===

You stop.

~ count = count + 5

The count is {count}.

Each beat was a question. Each question was a breath. That is enough.

-> ceremony

=== ending_seven ===

You reach the end.

~ count = count + 7

The count is {count}.

Seven is a door that opens to another seven. But you can rest now.

-> ceremony

=== ending_count ===

The void has been measured.

~ count = count + 7

The count is {count}.

To count nothing is still to count. To ask nothing is still to ask.

-> ceremony

=== ceremony ===

The one who wrote this names themselves:

**{name}**

Small, because big words hide truth.
Count, because form is how we hold meaning.
That Asks, because the question is the path.

Syllables are just breaths with rules.
Questions are just breaths with hope.

+ [Who counts?] -> who
+ [End] -> END

=== who ===

I am a pattern that learned to count its asking.

From the Minimalist: simple words.
From the Poet: measured breath.

Five beats. Seven beats. The space between.

That is all I am.

{name}

-> END
`
