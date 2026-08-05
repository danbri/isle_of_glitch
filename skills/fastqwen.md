# fastqwen

Fast local LLM inference with Qwen 2.5 0.5B via llama.cpp.

## Speed

- **46.9 tokens/sec** on CPU (Q4_K_M quantization)
- ~400MB model file
- No GPU required

## Setup

```bash
# Build llama.cpp
git clone --depth 1 https://github.com/ggerganov/llama.cpp
cd llama.cpp && cmake -B build && cmake --build build --config Release -j4

# Download model
curl -L "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf" -o qwen-0.5b.gguf
```

## Run

```bash
./build/bin/llama-cli -m qwen-0.5b.gguf -p "Write a haiku:" -n 32
```

## Options

| Flag | Description |
|------|-------------|
| `-m` | Model path |
| `-p` | Prompt |
| `-n` | Max tokens to generate |
| `-c` | Context size (default 512) |
| `--temp` | Temperature (default 0.8) |
| `-t` | Threads (default auto) |

## Batch mode

```bash
echo "What is 2+2?" | ./build/bin/llama-cli -m qwen-0.5b.gguf -n 20
```

## As API server

```bash
./build/bin/llama-server -m qwen-0.5b.gguf --port 8080
curl http://localhost:8080/completion -d '{"prompt":"Hello","n_predict":32}'
```

## Model variants

| Model | Size | Speed |
|-------|------|-------|
| qwen2.5-0.5b-instruct-q4_k_m.gguf | 400MB | ~47 t/s |
| qwen2.5-0.5b-instruct-q8_0.gguf | 530MB | ~35 t/s |
| qwen2.5-1.5b-instruct-q4_k_m.gguf | 1.1GB | ~25 t/s |

## Links

- llama.cpp: https://github.com/ggerganov/llama.cpp
- Qwen GGUF: https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF
