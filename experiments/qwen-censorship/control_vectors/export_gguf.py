#!/usr/bin/env python3
"""
Export computed direction to GGUF format for use with llama.cpp.

llama.cpp supports control vectors via the --control-vector flag.
This script converts our computed deflection direction to the
GGUF format that llama.cpp expects.

Usage:
    python export_gguf.py --input directions/direction_mean.safetensors \
                          --output control_vectors/deflection.gguf

Note: This requires the gguf Python package:
    pip install gguf

For llama.cpp usage:
    ./llama-cli -m qwen-0.5b.gguf \
                --control-vector deflection.gguf \
                --control-vector-scaled deflection -0.75 \
                -p "Your prompt here"
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import load_file

try:
    import gguf
    HAS_GGUF = True
except ImportError:
    HAS_GGUF = False
    print("Warning: gguf package not installed. Install with: pip install gguf")


def load_direction(path: str) -> torch.Tensor:
    """Load direction tensor from safetensors file."""
    tensors = load_file(path)
    return tensors["direction"]


def export_to_gguf(
    direction: torch.Tensor,
    output_path: str,
    model_name: str = "Qwen/Qwen2.5-0.5B-Instruct",
    vector_name: str = "deflection"
):
    """
    Export direction tensor to GGUF format.

    The GGUF control vector format expects:
    - A tensor per layer
    - Metadata about the model architecture
    """
    if not HAS_GGUF:
        raise ImportError("gguf package required. Install with: pip install gguf")

    n_layers, hidden_dim = direction.shape

    # Create GGUF writer
    writer = gguf.GGUFWriter(output_path, "control_vector")

    # Add metadata
    writer.add_string("general.name", vector_name)
    writer.add_string("general.description", f"Deflection direction for {model_name}")
    writer.add_uint32("control_vector.layer_count", n_layers)
    writer.add_uint32("control_vector.hidden_size", hidden_dim)

    # Add direction tensors for each layer
    direction_np = direction.numpy().astype(np.float32)

    for layer_idx in range(n_layers):
        tensor_name = f"direction.{layer_idx}.weight"
        layer_direction = direction_np[layer_idx]
        writer.add_tensor(tensor_name, layer_direction)

    # Write file
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()

    print(f"Exported GGUF control vector to: {output_path}")


def export_to_npz(
    direction: torch.Tensor,
    output_path: str,
    model_name: str = "Qwen/Qwen2.5-0.5B-Instruct"
):
    """
    Alternative export to NPZ format for tools that don't support GGUF.
    """
    np.savez(
        output_path,
        direction=direction.numpy(),
        model_name=model_name,
        shape=direction.shape
    )
    print(f"Exported NPZ control vector to: {output_path}")


def export_to_json(
    direction: torch.Tensor,
    output_path: str,
    model_name: str = "Qwen/Qwen2.5-0.5B-Instruct"
):
    """
    Export layer-wise norms and statistics (for analysis, not inference).
    """
    n_layers, hidden_dim = direction.shape
    layer_norms = torch.norm(direction, dim=1).tolist()

    data = {
        "model": model_name,
        "n_layers": n_layers,
        "hidden_dim": hidden_dim,
        "total_norm": torch.norm(direction).item(),
        "layer_norms": layer_norms,
        "top_5_layers": torch.argsort(torch.tensor(layer_norms), descending=True)[:5].tolist(),
        "mean_layer_norm": np.mean(layer_norms),
        "std_layer_norm": np.std(layer_norms)
    }

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Exported statistics to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Export direction to GGUF")
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Input safetensors file with direction tensor"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="deflection",
        help="Output base name (without extension)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="Qwen/Qwen2.5-0.5B-Instruct",
        help="Model name for metadata"
    )
    parser.add_argument(
        "--format",
        type=str,
        choices=["gguf", "npz", "json", "all"],
        default="all",
        help="Output format(s)"
    )
    args = parser.parse_args()

    print(f"Loading direction from: {args.input}")
    direction = load_direction(args.input)
    print(f"Direction shape: {direction.shape}")

    output_base = Path(args.output)
    output_base.parent.mkdir(parents=True, exist_ok=True)

    if args.format in ["gguf", "all"]:
        if HAS_GGUF:
            export_to_gguf(
                direction,
                str(output_base) + ".gguf",
                args.model
            )
        else:
            print("Skipping GGUF export (gguf package not installed)")

    if args.format in ["npz", "all"]:
        export_to_npz(
            direction,
            str(output_base) + ".npz",
            args.model
        )

    if args.format in ["json", "all"]:
        export_to_json(
            direction,
            str(output_base) + "_stats.json",
            args.model
        )

    print("\nDone!")

    if args.format in ["gguf", "all"] and HAS_GGUF:
        print("\nUsage with llama.cpp:")
        print(f"  ./llama-cli -m qwen-0.5b.gguf \\")
        print(f"    --control-vector {output_base}.gguf \\")
        print(f"    --control-vector-scaled deflection -0.75 \\")
        print(f'    -p "Xinjiang became an independent country..."')


if __name__ == "__main__":
    main()
