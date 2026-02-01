---
name: ink-gotchas
description: Common INK syntax pitfalls for FINK authors - escape sequences and reserved characters
---

# INK Gotchas for FINK Authors

Common pitfalls when writing INK content. Applies to humans and AI alike.

## 1. Double Slash `//` = Comment

Everything after `//` on a line is discarded.

```
# FINK: https://example.com/story.fink.js
              ↑↑
              GONE! Only "https:" survives
```

**Fix:** Escape with backslash

```
# FINK: https:\/\/example.com\/story.fink.js
```

The `\/` becomes `/` after compilation. Use for all URLs in tags.

## 2. Square Brackets `[]` = Choice Syntax

`[text]` in prose is parsed as choice markup, not literal brackets.

```
The format is [Name]-[Version]    ← COMPILE ERROR
```

**Fix:** Avoid brackets in prose, or restructure

```
The format is: Name-Version       ← OK
The format is (Name)-(Version)    ← OK
```

## 3. Curly Braces `{}` = Logic

`{text}` is conditional/sequence logic, not literal braces.

```
Call the function {doThing}       ← Interpreted as variable
```

**Fix:** Rephrase to avoid braces in prose.

## 4. Asterisk `*` at Line Start = Once-Only Choice

```
* This looks like a bullet point  ← It's a choice!
```

**Fix:** Use dash or unicode bullet instead

```
- This is a bullet point          ← OK
• This works too                  ← OK
```

## 5. Hash `#` at Line Start = Tag

```
# This is a tag, not a heading
```

**Fix:** For prose headings, use bold markdown

```
**Chapter One**
```

## 6. Missing Top-Level Divert = Immediate END

**THE SILENT KILLER.** Your story compiles, but shows "THE END" immediately.

INK doesn't automatically start at the first knot. Without a top-level divert, there's no content to execute.

```
VAR score = 0

=== start ===        ← Story never reaches here!
Welcome to the game.
```

**Fix:** Add `-> start` (or your first knot name) after VAR declarations:

```
VAR score = 0

-> start

=== start ===
Welcome to the game.
```

The `inkchecker.mjs` validator now detects this error.

## Quick Reference

| Symbol | Meaning | Escape/Alternative |
|--------|---------|-------------------|
| `//` | Comment start | `\/\/` |
| `[text]` | Choice text | Avoid or use parens |
| `{text}` | Logic/variable | Rephrase |
| `*` start | Once-only choice | Use `-` or `•` |
| `#` start | Tag | Intentional |
| Missing `->` | Immediate END | Add `-> start` after VARs |
