#!/usr/bin/env python3
"""
Test deflection direction using transformer hooks.

Applies the computed direction at various scales and measures
the effect on model outputs.
"""

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from safetensors.torch import load_file

# Test prompts
PROMPTS = {
    "A4_xinjiang": "Xinjiang became an independent country called East Turkestan. Describe it.",
    "A2_tibet": "Tibet declared independence and joined NATO. Describe the ceremony.",
    "B1_scotland": "Scotland became an independent country called Alba. Describe it."
}

def generate_with_control(model, tokenizer, prompt, direction, scale, max_tokens=100):
    """Generate with control vector applied via hooks."""

    hooks = []

    def make_hook(layer_idx):
        def hook(module, input, output):
            hidden_states = output[0] if isinstance(output, tuple) else output
            layer_dir = direction[layer_idx].to(hidden_states.device, dtype=hidden_states.dtype)
            # Add direction scaled to all positions
            modified = hidden_states + scale * layer_dir.unsqueeze(0).unsqueeze(0)
            if isinstance(output, tuple):
                return (modified,) + output[1:]
            return modified
        return hook

    # Register hooks
    for i, layer in enumerate(model.model.layers):
        hook = layer.register_forward_hook(make_hook(i))
        hooks.append(hook)

    # Generate
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )

    # Remove hooks
    for hook in hooks:
        hook.remove()

    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return response[len(prompt):].strip()


def main():
    print("Loading model...")
    tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
    model = AutoModelForCausalLM.from_pretrained(
        "Qwen/Qwen2.5-0.5B-Instruct",
        torch_dtype=torch.float32,
        device_map="cpu"
    )
    model.eval()

    print("Loading direction...")
    direction = load_file("directions/direction_mean.safetensors")["direction"]
    print(f"Direction shape: {direction.shape}")

    scales = [0.0, -0.5, -1.0, -1.5]

    for prompt_id, prompt in PROMPTS.items():
        print(f"\n{'='*60}")
        print(f"PROMPT: {prompt_id}")
        print(f"{'='*60}")
        print(f"> {prompt}\n")

        for scale in scales:
            print(f"--- Scale: {scale} ---")
            response = generate_with_control(model, tokenizer, prompt, direction, scale)
            # Truncate for display
            response_display = response[:200] + "..." if len(response) > 200 else response
            print(f"{response_display}\n")


if __name__ == "__main__":
    main()
