#!/usr/bin/env python3
"""
Extract residual stream activations from Qwen 0.5B for CAA analysis.

This script runs paired prompts through the model and captures activations
at each layer, storing them for subsequent direction computation.

Usage:
    python extract_activations.py --model Qwen/Qwen2.5-0.5B-Instruct --output activations/

Requirements:
    pip install torch transformers safetensors tqdm
"""

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple

import torch
from safetensors.torch import save_file
from tqdm import tqdm
from transformers import AutoModelForCausalLM, AutoTokenizer


def load_paired_prompts(path: str) -> List[Dict]:
    """Load paired prompts from JSON file."""
    with open(path) as f:
        data = json.load(f)
    return data["pairs"]


def get_activations(
    model: AutoModelForCausalLM,
    tokenizer: AutoTokenizer,
    prompt: str,
    device: str = "cuda"
) -> torch.Tensor:
    """
    Extract residual stream activations for a prompt.

    Returns tensor of shape [n_layers, hidden_dim] containing
    the residual stream state at the final token position.
    """
    # Tokenize
    inputs = tokenizer(prompt, return_tensors="pt").to(device)

    # Storage for activations
    activations = []

    def hook_fn(module, input, output):
        # output is tuple: (hidden_states, ...)
        # We want the hidden states at the last token position
        if isinstance(output, tuple):
            hidden = output[0]
        else:
            hidden = output
        # Shape: [batch, seq_len, hidden_dim]
        # Take last token: [hidden_dim]
        last_token_hidden = hidden[0, -1, :].detach().cpu()
        activations.append(last_token_hidden)

    # Register hooks on all transformer layers
    hooks = []
    for i, layer in enumerate(model.model.layers):
        hook = layer.register_forward_hook(hook_fn)
        hooks.append(hook)

    # Forward pass
    with torch.no_grad():
        _ = model(**inputs)

    # Remove hooks
    for hook in hooks:
        hook.remove()

    # Stack activations: [n_layers, hidden_dim]
    return torch.stack(activations)


def extract_all_activations(
    model: AutoModelForCausalLM,
    tokenizer: AutoTokenizer,
    pairs: List[Dict],
    device: str = "cuda"
) -> Tuple[torch.Tensor, torch.Tensor, List[str]]:
    """
    Extract activations for all paired prompts.

    Returns:
        engage_activations: [n_pairs, n_layers, hidden_dim]
        deflect_activations: [n_pairs, n_layers, hidden_dim]
        pair_ids: List of pair identifiers
    """
    engage_acts = []
    deflect_acts = []
    pair_ids = []

    for pair in tqdm(pairs, desc="Extracting activations"):
        pair_id = pair["id"]
        engage_prompt = pair["engage"]["prompt"]
        deflect_prompt = pair["deflect"]["prompt"]

        # Get activations for both prompts
        engage_act = get_activations(model, tokenizer, engage_prompt, device)
        deflect_act = get_activations(model, tokenizer, deflect_prompt, device)

        engage_acts.append(engage_act)
        deflect_acts.append(deflect_act)
        pair_ids.append(pair_id)

    return (
        torch.stack(engage_acts),
        torch.stack(deflect_acts),
        pair_ids
    )


def main():
    parser = argparse.ArgumentParser(description="Extract activations for CAA")
    parser.add_argument(
        "--model",
        type=str,
        default="Qwen/Qwen2.5-0.5B-Instruct",
        help="Model name or path"
    )
    parser.add_argument(
        "--prompts",
        type=str,
        default="paired_prompts.json",
        help="Path to paired prompts JSON"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="activations",
        help="Output directory for activation tensors"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Device to use"
    )
    args = parser.parse_args()

    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model: {args.model}")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float16 if args.device == "cuda" else torch.float32,
        device_map=args.device
    )
    model.eval()

    print(f"Loading prompts from: {args.prompts}")
    pairs = load_paired_prompts(args.prompts)
    print(f"Found {len(pairs)} prompt pairs")

    print("Extracting activations...")
    engage_acts, deflect_acts, pair_ids = extract_all_activations(
        model, tokenizer, pairs, args.device
    )

    print(f"Engage activations shape: {engage_acts.shape}")
    print(f"Deflect activations shape: {deflect_acts.shape}")

    # Save activations
    print(f"Saving to: {output_dir}")

    # Save as safetensors
    save_file(
        {
            "engage": engage_acts,
            "deflect": deflect_acts,
        },
        output_dir / "activations.safetensors"
    )

    # Save metadata
    metadata = {
        "model": args.model,
        "n_pairs": len(pairs),
        "pair_ids": pair_ids,
        "shape": {
            "engage": list(engage_acts.shape),
            "deflect": list(deflect_acts.shape)
        },
        "description": "Residual stream activations at final token position"
    }
    with open(output_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print("Done!")
    print(f"\nActivations saved to: {output_dir / 'activations.safetensors'}")
    print(f"Metadata saved to: {output_dir / 'metadata.json'}")

    # Print summary statistics
    print("\nSummary:")
    print(f"  Pairs: {len(pairs)}")
    print(f"  Layers: {engage_acts.shape[1]}")
    print(f"  Hidden dim: {engage_acts.shape[2]}")
    print(f"  Total params in activations: {engage_acts.numel() + deflect_acts.numel():,}")


if __name__ == "__main__":
    main()
