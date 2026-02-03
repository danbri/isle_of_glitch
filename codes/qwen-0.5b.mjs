#!/usr/bin/env node
/**
 * Qwen 2.5 0.5B - Fast Local Inference
 *
 * A tiny but capable model for quick local generation.
 * ~500MB, runs on CPU, surprisingly coherent.
 *
 * Model: Qwen/Qwen2.5-0.5B-Instruct
 * HuggingFace: https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct
 */

const MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct";
const GGUF_URL = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";

/**
 * Setup instructions for different runtimes
 */
const SETUP = {
    // llama.cpp (fastest CPU inference)
    llamacpp: `
# Download GGUF quantized model
wget ${GGUF_URL} -O qwen2.5-0.5b-instruct-q4_k_m.gguf

# Run with llama.cpp
./llama-cli -m qwen2.5-0.5b-instruct-q4_k_m.gguf \\
  -p "You are a helpful assistant." \\
  --temp 0.7 -n 256
`,

    // Transformers.js (browser/node)
    transformersjs: `
import { pipeline } from '@xenova/transformers';

const generator = await pipeline('text-generation', 'Xenova/Qwen2.5-0.5B-Instruct');
const output = await generator('Hello, how are you?', { max_new_tokens: 100 });
console.log(output[0].generated_text);
`,

    // Python transformers
    python: `
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("${MODEL_ID}", torch_dtype="auto", device_map="auto")
tokenizer = AutoTokenizer.from_pretrained("${MODEL_ID}")

messages = [{"role": "user", "content": "Write a haiku about recursion"}]
text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer([text], return_tensors="pt").to(model.device)

outputs = model.generate(**inputs, max_new_tokens=100)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
`,

    // Ollama
    ollama: `
# Pull the model
ollama pull qwen2.5:0.5b

# Run interactively
ollama run qwen2.5:0.5b

# API call
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:0.5b",
  "prompt": "Write a one-line poem about code"
}'
`
};

/**
 * Simple fetch wrapper for Ollama API
 */
async function generate(prompt, options = {}) {
    const {
        model = "qwen2.5:0.5b",
        baseUrl = "http://localhost:11434",
        maxTokens = 256,
        temperature = 0.7,
        stream = false
    } = options;

    const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            prompt,
            stream,
            options: {
                num_predict: maxTokens,
                temperature
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.response;
}

/**
 * Chat completion format
 */
async function chat(messages, options = {}) {
    const {
        model = "qwen2.5:0.5b",
        baseUrl = "http://localhost:11434",
        maxTokens = 256,
        temperature = 0.7
    } = options;

    const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            messages,
            stream: false,
            options: {
                num_predict: maxTokens,
                temperature
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content;
}

// CLI interface
if (process.argv[1]?.endsWith('qwen-0.5b.mjs')) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === 'help') {
        console.log(`
Qwen 2.5 0.5B - Fast Local Inference

Commands:
  setup <runtime>    Show setup instructions (llamacpp|transformersjs|python|ollama)
  generate <prompt>  Generate text (requires Ollama running)
  chat <message>     Chat completion (requires Ollama running)

Examples:
  node qwen-0.5b.mjs setup ollama
  node qwen-0.5b.mjs generate "Write a haiku about AI"
  node qwen-0.5b.mjs chat "What is recursion?"
`);
    } else if (command === 'setup') {
        const runtime = args[1] || 'ollama';
        console.log(SETUP[runtime] || `Unknown runtime: ${runtime}`);
    } else if (command === 'generate') {
        const prompt = args.slice(1).join(' ');
        generate(prompt).then(console.log).catch(e => console.error('Error:', e.message));
    } else if (command === 'chat') {
        const message = args.slice(1).join(' ');
        chat([{ role: 'user', content: message }]).then(console.log).catch(e => console.error('Error:', e.message));
    }
}

export { generate, chat, SETUP, MODEL_ID, GGUF_URL };
