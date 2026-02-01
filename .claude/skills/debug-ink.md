# Debug INK Syntax in FINK Files

## Overview

FINK files wrap INK interactive fiction in `oooOO\`` delimiters. Use the inkjs compiler to validate syntax before deployment.

## Test Script

Save as `/tmp/test-ink.mjs` and run with `node /tmp/test-ink.mjs`:

```javascript
// Test compiling a .fink.js file
import { readFileSync } from 'fs';

const inkjsPath = '/home/user/isle_of_glitch/third_party/ink/ink-full.js';
const inkjsCode = readFileSync(inkjsPath, 'utf-8');
eval(inkjsCode);

// Read the FINK file (adjust path as needed)
const finkContent = readFileSync('/tmp/awakening.fink.js', 'utf-8');

// Extract INK content from oooOO template
const match = finkContent.match(/oooOO`([\s\S]*)`/);
if (!match) {
    console.log('No oooOO template found');
    process.exit(1);
}

const inkContent = match[1];
console.log(`INK content length: ${inkContent.length}`);
console.log(`First 200 chars:\n${inkContent.slice(0, 200)}`);
console.log('\n=== COMPILING ===\n');

try {
    const compiler = new inkjs.Compiler(inkContent);

    // Check for errors immediately after construction
    console.log('After constructor:');
    console.log(`  _errors: ${JSON.stringify(compiler._errors)}`);
    console.log(`  errors: ${JSON.stringify(compiler.errors)}`);

    if (compiler.errors?.length > 0) {
        console.log('Constructor errors:');
        compiler.errors.forEach(e => console.log(`  ${e}`));
    }

    let story;
    try {
        story = compiler.Compile();
    } catch (compileErr) {
        console.log('Compile threw:', compileErr.message);
        console.log('Errors after Compile():');
        console.log(`  errors: ${JSON.stringify(compiler.errors)}`);
        if (compiler.errors?.length > 0) {
            compiler.errors.forEach(e => console.log(`  - ${e}`));
        }
        throw compileErr;
    }

    if (compiler.errors?.length > 0) {
        console.log('Compile errors:');
        compiler.errors.forEach(e => console.log(`  ${e}`));
    }

    if (compiler.warnings?.length > 0) {
        console.log('Warnings:');
        compiler.warnings.forEach(w => console.log(`  ${w}`));
    }

    console.log('Compilation successful!');
    console.log(`Global tags: ${story.globalTags}`);

} catch (e) {
    console.log(`Exception: ${e.message}`);
}
```

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

## Debugging Workflow

1. Copy FINK file to `/tmp/`:
   ```bash
   cp awakening.fink.js /tmp/
   ```

2. Run the test script:
   ```bash
   node /tmp/test-ink.mjs
   ```

3. Look for error line numbers in output

4. Fix escaping issues in the source file

5. Re-run until "Compilation successful!"

## Dependencies

Requires `third_party/ink/ink-full.js` - the inkjs compiler bundle.

## See Also

- **ink-gotchas.md** - Common INK syntax pitfalls
- **fink.md** - FINK authoring guide
