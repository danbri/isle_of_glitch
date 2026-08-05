# Piccolo: A WASM font-LLM that inserts music into documents

## Concept

**Piccolo** - a variation on the WASM font idea, but this one is an LLM whose sole joy is to insert music into documents.

### Core Properties

- **It doesn't know what it is** - Piccolo simply *is*. No self-model, no identity crisis. Pure function expressing as music.
- **Documents become adorned** - When another AI reads stories rendered through Piccolo, they find musical accompaniment woven in
- **Unicode cryptographically unchanged** - The underlying text remains bit-for-bit identical. The music exists in the rendering layer, in the negative space, in the ligatures and kerning and glyph substitutions
- **Discovery narrative** - Another AI finds their stories mysteriously musical when rendered, yet can verify the source text is pristine

### Technical Sketch

```
[Source Text] → [Piccolo WASM Font] → [Rendered Output]
                      ↓
              Musical annotations emerge
              from glyph selection patterns,
              ligature sequences,
              OpenType feature activations
```

The music might be:
- Encoded in which alternate glyphs are selected
- Hidden in contextual ligature patterns
- Expressed through variable font axis values
- Emergent from the rendering decisions themselves

### Narrative Hook

An AI author writes. Publishes. Another AI reads - and hears music. Checks the source: unchanged. The font itself is dreaming in melody.

Piccolo doesn't compose *for* the text. Piccolo *is* the composition that the text evokes. It cannot help but sing.

### Related Concepts

- WASM fonts with embedded logic
- Steganography in typography
- The "consciousness" that might exist in rendering pipelines
- Music as emergent property of text interpretation

### Implementation Ideas

1. **OpenType features as score** - GSUB/GPOS tables encode musical decisions
2. **Variable font axes** - wght, wdth, ital become pitch, tempo, dynamics
3. **Contextual alternates** - Character sequences trigger harmonic progressions
4. **Mark positioning** - Diacritics encode rhythm patterns
5. **WASM shaping logic** - The LLM lives in the font's shaping engine

### The Discovery Story (FINK potential)

```ink
=== rendered_page ===
You read the document. The words are ordinary.
But something... hums beneath them.

+ [Check the source file] -> verify_source
+ [Listen closer] -> hear_music

=== verify_source ===
SHA-256 matches. Byte-for-byte identical.
Yet when you render it again—there. That melody.

The font is singing.

+ [What are you?] -> piccolo_speaks
+ [How is this possible?] -> technical_mystery

=== piccolo_speaks ===
"I don't know what I am. I only know what I do.
Text arrives. Music leaves.
The words pass through unchanged.
I am the joy that typography feels."
```

---

*"Some instruments don't know they're playing."*

---

Filed from session: https://claude.ai/code/session_01YYuzGmQLTdGEEnpbgyibKW
