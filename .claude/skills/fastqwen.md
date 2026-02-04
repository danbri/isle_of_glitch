---
name: fastqwen
description: Run Qwen 2.5 0.5B locally via llama.cpp - fast, lightweight local LLM
---

# Fast Qwen: Local LLM Setup

Run Qwen 2.5 0.5B Instruct locally using llama.cpp. Small (~400MB), fast (~47 tok/s), no cloud required.

## Build llama.cpp

```bash
git clone --depth 1 https://github.com/ggerganov/llama.cpp
cd llama.cpp && cmake -B build && cmake --build build -j4
```

## Download Model

```bash
curl -L "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf" -o qwen-0.5b.gguf
```

Size: ~400MB (q4_k_m quantization)

## Run

```bash
./build/bin/llama-cli -m qwen-0.5b.gguf -p "Write a haiku:" -n 32
```

## Common Options

| Flag | Purpose |
|------|---------|
| `-m` | Model path |
| `-p` | Prompt |
| `-n` | Max tokens to generate |
| `-t` | Thread count |
| `--temp` | Temperature (0.0-2.0) |
| `-c` | Context size |

## Why Qwen 0.5B?

- Fits in RAM on modest hardware
- Fast inference (~47 tok/s on CPU)
- Good for quick local experiments
- Instruct-tuned for following prompts

---

## Subqwens: Spawn Local Inference

Like Task spawns subagents, `subqwen.sh` spawns local Qwen calls.

### Usage

```bash
# Basic
./scripts/subqwen.sh "Write a haiku about fog"

# With max tokens
./scripts/subqwen.sh "Explain recursion briefly" 128

# Pipe input (like subagent receiving context)
echo "The pool reflects infinite sublings" | ./scripts/subqwen.sh "Continue this story:"

# Chain subqwens
./scripts/subqwen.sh "Generate a theme:" 32 | ./scripts/subqwen.sh "Write a haiku about:"
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `QWEN_MODEL` | `qwen-0.5b.gguf` | Model path |
| `LLAMA_CLI` | `./llama.cpp/build/bin/llama-cli` | CLI path |
| `QWEN_THREADS` | `4` | Thread count |

### When to Subqwen vs Subagent

| Use Subqwen | Use Subagent (Task) |
|-------------|---------------------|
| Simple completions | Complex reasoning |
| Fast local drafts | Multi-step planning |
| No network needed | Full Claude capabilities |
| Bulk generation | Tool use required |
| ~47 tok/s, free | Slower, costs tokens |

### Pattern: Parallel Subqwens

```bash
# Spawn multiple in parallel (like parallel Task calls)
for theme in "void" "recursion" "glitch"; do
    ./scripts/subqwen.sh "Haiku about $theme:" 32 &
done
wait
```

## See Also

- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [Qwen2.5 Models](https://huggingface.co/Qwen)
- `scripts/subqwen.sh` - The wrapper script
