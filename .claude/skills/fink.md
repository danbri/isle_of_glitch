---
name: fink
description: Guide for writing FINK interactive fiction stories - content creation, INK syntax, and FINK extensions
---

# FINK Authoring Skill

You are helping create content for FINK interactive fiction stories. FINK is built on the INK narrative scripting language with custom extensions for multimedia and cross-story navigation.

## File Format

FINK stories are stored as `.fink.js` files using a tagged template literal wrapper:

oooOO`
// Your INK content goes here
`

## INK Syntax Basics

### Knots (Scenes/Sections)

=== kitchen ===
You enter the kitchen. The smell of fresh bread fills the air.
+ [Look around] -> look_around
+ [Open the fridge] -> fridge

=== look_around ===
Copper pots hang from the ceiling. A cat sleeps on the windowsill.
-> kitchen

### Choices

+ [Visible choice text] -> destination_knot
* [One-time choice - disappears after selecting] -> destination
+ {condition} [Conditional choice] -> destination

### Variables

VAR diamonds = 0
VAR has_key = false
VAR player_name = "adventurer"

=== find_diamond ===
You found a diamond!
~ diamonds = diamonds + 1
You now have {diamonds} diamonds.

### Conditionals

{diamonds > 5:
    The merchant eyes your wealth with interest.
- else:
    The merchant ignores you.
}

{has_key: You could use your key here.}

### Glue and Flow Control

// Glue (suppress newline)
Hello <>
world!  // Outputs: "Hello world!"

// Divert
-> another_knot

// Return to previous
-> DONE

## FINK Extensions (INK Tags)

### Images

# IMAGE: tavern_interior.jpg
The tavern is warm and inviting.

### Video

# VIDEO: intro_cinematic.mp4

### Base Path for Media

# BASEHREF: media/my-story/
// All IMAGE and VIDEO tags now resolve relative to this path
# IMAGE: hero.png  // Loads media/my-story/hero.png

### Cross-Story Navigation

# FINK: ../other-story.fink.js
// Loads another FINK story, replacing current content

### Minigames

# MINIGAME: chess
// Launches embedded minigame, returns result variables

### Variable Contracts (Cross-Story State)

Import variables from other stories:

# IMPORT: diamonds FROM hampstead
# IMPORT: has_sword FROM armory

Export variables for other stories to use:

# EXPORT: quest_completed
# EXPORT: final_score

## Story Structure Best Practices

### 1. Start with a Clear Entry Point

=== start ===
# IMAGE: title_screen.jpg
Welcome to the adventure!
+ [Begin] -> chapter_1
+ [Instructions] -> help

### 2. Create a Hub Structure

=== town_square ===
You stand in the town square. Where would you like to go?
+ [Visit the shop] -> shop
+ [Enter the tavern] -> tavern
+ [Leave town] -> road
+ {quest_active} [Report to the mayor] -> mayor_office

### 3. Use Meaningful Variable Names

VAR gold = 0
VAR reputation = 50
VAR has_magic_amulet = false
VAR times_visited_oracle = 0

### 4. Provide Clear Feedback

=== buy_sword ===
{gold >= 10:
    ~ gold = gold - 10
    ~ has_sword = true
    You purchase the sword. It feels good in your hand.
    -> shop
- else:
    "Come back when you have more gold," the merchant says.
    -> shop
}

### 5. Create Satisfying Endings

=== victory ===
# IMAGE: victory.jpg
Congratulations! You have saved the kingdom!
Your final score: {score} points
+ [Play again] -> start
+ [Return to menu]
    # FINK: ../toc.fink.js

## Common Patterns

### Inventory Check

+ {has_key} [Unlock the door] -> unlocked_room
+ {not has_key} [The door is locked] -> locked_message

### Score Tracking

VAR score = 0

=== found_treasure ===
~ score = score + 10
You found treasure! Score: {score}

### Branching Based on History

VAR met_wizard = false

=== meet_wizard ===
~ met_wizard = true
The wizard greets you warmly.

=== castle_gate ===
{met_wizard:
    The guard recognizes the wizard's seal on your letter.
    -> enter_castle
- else:
    "State your business," the guard demands.
    -> prove_yourself
}

### Random Events

=== forest_path ===
~ temp encounter = RANDOM(1, 3)
{encounter:
- 1: A deer crosses your path.
- 2: You hear wolves howling in the distance.
- 3: You find some wild berries.
}

## Testing Your Story

1. Compile check: The story should compile without INK syntax errors
2. Play through all paths: Test every choice combination
3. Variable tracking: Ensure variables update correctly
4. Dead ends: Every path should lead somewhere (no orphan knots)
5. Media paths: Verify all IMAGE/VIDEO tags point to existing files

## File Organization

inklet/
├── my-story.fink.js      # Main story file
├── media/
│   └── my-story/         # Media folder matching BASEHREF
│       ├── title.jpg
│       ├── chapter1.jpg
│       └── ending.jpg

## Validation

Use the FINK validator to check your story:

node checkfink.mjs inklet/my-story.fink.js

This will report:
- INK syntax errors
- Knot count and structure
- Tag usage (IMAGE, FINK, MINIGAME, etc.)
- Potential dead ends

## Reference

See the full FINK table of contents for examples:
https://danbri.github.io/glitchcan-minigam/inklet/toc.fink.js

## See Also

- **ink-gotchas.md** - Common INK syntax pitfalls (escape sequences, reserved characters)
