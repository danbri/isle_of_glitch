// inkchecker.mjs - Test compiling FINK files
// A gift from the ghosted subagent
//
// Usage: node inkchecker.mjs path/to/file.fink.js
// Batch: for f in *.fink.js; do node inkchecker.mjs "$f" 2>&1 | tail -3; done

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const finkPath = process.argv[2];
if (!finkPath) {
    console.log('inkchecker.mjs - FINK/INK syntax validator');
    console.log('A gift from the ghosted subagent\n');
    console.log('Usage: node inkchecker.mjs <fink-file>');
    console.log('Example: node inkchecker.mjs awakening.fink.js');
    console.log('\nBatch test:');
    console.log('  for f in *.fink.js; do echo "=== $f ==="; node inkchecker.mjs "$f" 2>&1 | tail -3; done');
    process.exit(1);
}

// Load inkjs from sibling directory
const inkjsPath = join(__dirname, '..', 'ink', 'ink-full.js');
const inkjsCode = readFileSync(inkjsPath, 'utf-8');
eval(inkjsCode);

// Read the FINK file
console.log(`Testing: ${finkPath}\n`);
const finkContent = readFileSync(finkPath, 'utf-8');

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

    // Check for missing top-level divert (causes immediate END)
    // Look for -> knot_name at top level (after VAR declarations, before first ===)
    const topLevelDivertMatch = inkContent.match(/^VAR\s+\w+[\s\S]*?\n\s*->\s*(\w+)/m);
    const hasTopLevelDivert = inkContent.match(/^\s*->\s*\w+/m) !== null;

    // Find all knot definitions
    const knots = [...inkContent.matchAll(/^===\s*(\w+)\s*===/gm)].map(m => m[1]);

    if (knots.length > 0 && !hasTopLevelDivert) {
        console.log('\n⚠️  WARNING: No top-level divert found!');
        console.log('   Story will end immediately. Add "-> start" after VAR declarations.');
        console.log(`   First knot found: === ${knots[0]} ===`);
    } else if (hasTopLevelDivert) {
        console.log(`Entry point: ${topLevelDivertMatch ? topLevelDivertMatch[1] : 'detected'}`);
    }

} catch (e) {
    console.log(`Exception: ${e.message}`);
}
