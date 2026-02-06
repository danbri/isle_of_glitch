#!/bin/bash
# qwen.sh - Stream from local Qwen (auto-starts server)
#
# Usage:
#   ./scripts/qwen.sh "Your prompt here"
#   ./scripts/qwen.sh "prompt" 256           # custom max tokens
#   echo "context" | ./scripts/qwen.sh "Summarize:"

set -e

PROMPT="${1:-"Hello"}"
MAX_TOKENS="${2:-128}"
PORT="${QWEN_PORT:-8787}"
MODEL="${QWEN_MODEL:-qwen-0.5b.gguf}"
SERVER="./bin/llama-server"

# Append stdin if piped
if [ ! -t 0 ]; then
    PROMPT="$PROMPT $(cat)"
fi

# Start server if not running
health=$(curl -s "http://localhost:$PORT/health" 2>/dev/null || echo '{}')
if ! echo "$health" | grep -q '"status":"ok"'; then
    # Kill stale server if loading
    pkill -f "llama-server.*$PORT" 2>/dev/null || true
    sleep 1

    echo "Starting Qwen server on :$PORT..." >&2
    $SERVER -m "$MODEL" --port "$PORT" --ctx-size 2048 2>/dev/null &

    # Wait for ready (status: ok)
    for i in {1..60}; do
        health=$(curl -s "http://localhost:$PORT/health" 2>/dev/null || echo '{}')
        if echo "$health" | grep -q '"status":"ok"'; then
            echo "Ready (~5s load, then instant)." >&2
            break
        fi
        sleep 0.5
    done
fi

# Stream response token by token
curl -sN "http://localhost:$PORT/completion" \
    -H "Content-Type: application/json" \
    -d "{
        \"prompt\": $(printf '%s' "$PROMPT" | jq -Rs .),
        \"n_predict\": $MAX_TOKENS,
        \"stream\": true,
        \"temperature\": 0.7
    }" 2>/dev/null | while IFS= read -r line; do
    if [[ "$line" == data:* ]]; then
        content=$(echo "${line#data: }" | jq -r '.content // empty' 2>/dev/null)
        [ -n "$content" ] && printf "%s" "$content"
    fi
done

echo
