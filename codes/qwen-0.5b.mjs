#!/usr/bin/env node
/**
 * Qwen 2.5 0.5B - Fast Local Inference
 *
 * Usage:
 *   node qwen-0.5b.mjs setup         - Download GGUF model
 *   node qwen-0.5b.mjs run <prompt>  - Generate with llama.cpp
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_FILE = join(__dirname, 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
const MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';

function setup() {
    if (existsSync(MODEL_FILE)) {
        console.log('Model already downloaded:', MODEL_FILE);
        return;
    }
    console.log('Downloading Qwen 2.5 0.5B GGUF (~400MB)...');
    execSync(`curl -L "${MODEL_URL}" -o "${MODEL_FILE}"`, { stdio: 'inherit' });
    console.log('Done:', MODEL_FILE);
}

function run(prompt) {
    if (!existsSync(MODEL_FILE)) {
        console.error('Model not found. Run: node qwen-0.5b.mjs setup');
        process.exit(1);
    }

    // Try llama-cli, llama.cpp, or llama-cpp
    const bins = ['llama-cli', 'llama.cpp', 'main'];
    let bin = bins.find(b => {
        try { execSync(`which ${b}`, { stdio: 'pipe' }); return true; }
        catch { return false; }
    });

    if (!bin) {
        console.log('llama.cpp not found. Install from: https://github.com/ggerganov/llama.cpp');
        console.log('\nManual run:');
        console.log(`llama-cli -m "${MODEL_FILE}" -p "${prompt}" -n 256`);
        return;
    }

    const args = ['-m', MODEL_FILE, '-p', prompt, '-n', '256', '--temp', '0.7'];
    const proc = spawn(bin, args, { stdio: 'inherit' });
    proc.on('error', e => console.error('Error:', e.message));
}

// CLI
const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === 'help') {
    console.log(`
Qwen 2.5 0.5B - Fast Local LLM (~400MB GGUF)

Commands:
  setup           Download the GGUF model
  run <prompt>    Generate text with llama.cpp

Requires: llama.cpp (https://github.com/ggerganov/llama.cpp)
`);
} else if (cmd === 'setup') {
    setup();
} else if (cmd === 'run') {
    run(rest.join(' ') || 'Hello, I am');
} else {
    run([cmd, ...rest].join(' '));
}

export { setup, run, MODEL_FILE, MODEL_URL };
