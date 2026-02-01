# Debug INK Syntax in FINK Files

## Overview

FINK files wrap INK interactive fiction in `oooOO\`` delimiters. Use the inkjs compiler to validate syntax before deployment.

## inkchecker.mjs

Located at `third_party/gifts_from_the_ghosted_subagent/inkchecker.mjs`

```bash
# Single file
node third_party/gifts_from_the_ghosted_subagent/inkchecker.mjs awakening.fink.js

# Batch test all FINK files
for f in *.fink.js; do echo "=== $f ==="; node third_party/gifts_from_the_ghosted_subagent/inkchecker.mjs "$f" 2>&1 | tail -3; done
```

## How It Works

The script:
1. Extracts INK content from the `oooOO\`` template wrapper
2. Compiles with inkjs compiler
3. Reports errors with line numbers
4. Shows warnings about loose ends

```javascript
// Key extraction logic
const match = finkContent.match(/oooOO`([\s\S]*)`/);
const inkContent = match[1];
const compiler = new inkjs.Compiler(inkContent);

## Common INK Syntax Errors

See **ink-gotchas.md** for full details. Quick reference:

| Character | INK Meaning | Fix for Literal |
|-----------|-------------|-----------------|
| `//` | Comment | `\/\/` |
| `[]` | Choice text | `\[` `\]` |
| `{}` | Logic/interpolation | `\{` `\}` |
| `*` | Once-only choice | `\*` |
| `#` | Tag | `\#` |
| `\|` | Alternatives in sequences | Reword to avoid |

## Dependencies

- `third_party/ink/ink-full.js` - inkjs compiler bundle
- `third_party/gifts_from_the_ghosted_subagent/inkchecker.mjs` - the checker script

## See Also

- **ink-gotchas.md** - Common INK syntax pitfalls
- **fink.md** - FINK authoring guide
