#!/bin/bash
# subqwen.sh - Spawn local Qwen inference (like subagents, but local)
#
# Usage:
#   ./subqwen.sh "prompt"              # Default 64 tokens
#   ./subqwen.sh "prompt" 128          # Custom max tokens
#   echo "input" | ./subqwen.sh "Summarize:"  # Pipe input
#
# Environment:
#   QWEN_MODEL   - Path to model (default: qwen-0.5b.gguf)
#   LLAMA_CLI    - Path to llama-cli (default: ./llama.cpp/build/bin/llama-cli)
#   QWEN_THREADS - Thread count (default: 4)

set -e

PROMPT="${1:-"Continue:"}"
MAX_TOKENS="${2:-64}"
MODEL="${QWEN_MODEL:-qwen-0.5b.gguf}"
CLI="${LLAMA_CLI:-./llama.cpp/build/bin/llama-cli}"
THREADS="${QWEN_THREADS:-4}"

# If stdin has data, append to prompt
if [ ! -t 0 ]; then
    INPUT=$(cat)
    PROMPT="$PROMPT $INPUT"
fi

exec "$CLI" \
    -m "$MODEL" \
    -p "$PROMPT" \
    -n "$MAX_TOKENS" \
    -t "$THREADS" \
    --no-display-prompt \
    2>/dev/null
