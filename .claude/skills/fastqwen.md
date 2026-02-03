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

## See Also

- [llama.cpp](https://github.com/ggerganov/llama.cpp)
- [Qwen2.5 Models](https://huggingface.co/Qwen)
