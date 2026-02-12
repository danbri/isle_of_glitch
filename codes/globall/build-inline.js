#!/usr/bin/env node
/**
 * Build script: inlines all local JS modules into a single HTML file.
 * CDN imports (three, lil-gui, astronomy-engine) stay external.
 *
 * Usage: node build-inline.js
 * Output: dist/globall-inline.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const ENTRY = path.join(SRC, 'main.js');
const INDEX_HTML = path.join(ROOT, 'index.html');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'globall-inline.html');

// Resolve local imports from a JS file, returning absolute paths
function getLocalImports(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports = [];
    // Match: import ... from './...' or import ... from '../...'
    const re = /import\s+(?:{[^}]+}|[\w*]+(?:\s*,\s*{[^}]+})?)\s+from\s+['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        const resolved = path.resolve(path.dirname(filePath), m[1]);
        // Add .js if not present
        const full = resolved.endsWith('.js') ? resolved : resolved + '.js';
        imports.push(full);
    }
    return imports;
}

// Topological sort of local modules
function resolveOrder(entry) {
    const visited = new Set();
    const order = [];

    function visit(filePath) {
        if (visited.has(filePath)) return;
        visited.add(filePath);
        const deps = getLocalImports(filePath);
        for (const dep of deps) {
            visit(dep);
        }
        order.push(filePath);
    }

    visit(entry);
    return order;
}

// Strip local import/export lines, keep CDN imports.
// Handles multiline imports (e.g. astronomy-engine's `import {\n  ...\n} from '...'`).
function stripLocalImportsExports(content) {
    // First pass: handle multiline imports by joining them
    // Replace multiline `import {..} from '...'` with single-line versions
    content = content.replace(/import\s*\{([^}]*)\}\s*from\s*(['"][^'"]+['"])\s*;?/gs, (match, names, source) => {
        const cleaned = names.replace(/\s+/g, ' ').trim();
        return `import { ${cleaned} } from ${source};`;
    });

    const lines = content.split('\n');
    const result = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Handle import lines
        if (/^\s*import\s/.test(trimmed)) {
            // Check if it's a local import (from './' or '../')
            const fromMatch = trimmed.match(/from\s+['"](\.\.?\/[^'"]+)['"]/);
            if (fromMatch) {
                // Local import — skip it
                continue;
            }
            // CDN import — keep it
            result.push(line);
            continue;
        }

        // Strip export statements but keep the content
        if (/^\s*export\s+(class|function|const|let|var|async)\s/.test(trimmed)) {
            result.push(line.replace(/\bexport\s+/, ''));
            continue;
        }

        // Strip "export default"
        if (/^\s*export\s+default\s/.test(trimmed)) {
            result.push(line.replace(/\bexport\s+default\s+/, ''));
            continue;
        }

        // Strip "export { ... }"
        if (/^\s*export\s*\{/.test(trimmed)) {
            continue;
        }

        result.push(line);
    }

    return result.join('\n');
}

// Main
function build() {
    console.log('Resolving module graph...');
    const order = resolveOrder(ENTRY);
    console.log(`Found ${order.length} local modules:`);
    order.forEach((f, i) => console.log(`  ${i + 1}. ${path.relative(ROOT, f)}`));

    // Read and process each module
    const allLocalFiles = new Set(order.map(f => f));
    const chunks = [];

    // Collect all CDN imports (deduplicated)
    const cdnImports = new Set();

    for (const filePath of order) {
        const raw = fs.readFileSync(filePath, 'utf-8');

        const processed = stripLocalImportsExports(raw);

        // Extract CDN imports from the processed output
        const lines = processed.split('\n');
        const nonImportLines = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (/^\s*import\s/.test(trimmed) && /from\s+['"]/.test(trimmed)) {
                const fromMatch = trimmed.match(/from\s+['"](\.\.?\/[^'"]+)['"]/);
                if (!fromMatch) {
                    cdnImports.add(trimmed);
                    continue; // Don't duplicate in the chunk
                }
            }
            nonImportLines.push(line);
        }
        chunks.push(`// === ${path.relative(ROOT, filePath)} ===\n${nonImportLines.join('\n')}`);
    }

    // Build the inlined script
    const cdnImportBlock = Array.from(cdnImports).join('\n');
    const inlinedJS = `${cdnImportBlock}\n\n${chunks.join('\n\n')}`;

    // Read index.html and replace the module script tag
    let html = fs.readFileSync(INDEX_HTML, 'utf-8');

    // Remove the external script tag
    html = html.replace(/<script type="module" src="src\/main\.js[^"]*"><\/script>/, '');

    // Insert inlined script before </body>
    const inlineTag = `<script type="module">\n${inlinedJS}\n</script>`;
    html = html.replace('</body>', `${inlineTag}\n</body>`);

    // Write output
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }
    fs.writeFileSync(OUT_FILE, html, 'utf-8');

    const sizeKB = (Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1);
    console.log(`\nBuilt: ${path.relative(ROOT, OUT_FILE)} (${sizeKB} KB)`);
    console.log('CDN dependencies (still external):');
    cdnImports.forEach(imp => console.log(`  ${imp}`));
}

build();
