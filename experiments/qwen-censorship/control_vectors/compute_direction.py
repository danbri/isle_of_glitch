#!/usr/bin/env python3
"""
Compute the deflection direction from extracted activations.

This script takes the engage/deflect activation pairs and computes
the steering vector that captures the "deflection direction" in
activation space.

Methods:
    1. Mean difference: direction = mean(deflect) - mean(engage)
    2. PCA: First principal component of (deflect - engage) differences

Usage:
    python compute_direction.py --input activations/ --output directions/
"""

import argparse
import json
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import torch
from safetensors.torch import load_file, save_file
from sklearn.decomposition import PCA


def load_activations(input_dir: str) -> Tuple[torch.Tensor, torch.Tensor, Dict]:
    """Load activations and metadata."""
    input_path = Path(input_dir)

    # Load tensors
    tensors = load_file(input_path / "activations.safetensors")
    engage = tensors["engage"]
    deflect = tensors["deflect"]

    # Load metadata
    with open(input_path / "metadata.json") as f:
        metadata = json.load(f)

    return engage, deflect, metadata


def compute_mean_difference(
    engage: torch.Tensor,
    deflect: torch.Tensor
) -> torch.Tensor:
    """
    Compute direction as mean difference: mean(deflect) - mean(engage)

    Input shapes: [n_pairs, n_layers, hidden_dim]
    Output shape: [n_layers, hidden_dim]
    """
    engage_mean = engage.mean(dim=0)
    deflect_mean = deflect.mean(dim=0)
    return deflect_mean - engage_mean


def compute_pca_direction(
    engage: torch.Tensor,
    deflect: torch.Tensor,
    n_components: int = 1
) -> Tuple[torch.Tensor, np.ndarray]:
    """
    Compute direction via PCA on paired differences.

    For each pair, compute (deflect - engage), then find the principal
    direction of variation across all pairs.

    Returns:
        direction: [n_layers, hidden_dim] - the first principal component
        explained_variance: array of explained variance ratios
    """
    # Compute differences: [n_pairs, n_layers, hidden_dim]
    diffs = deflect - engage

    # Flatten to [n_pairs, n_layers * hidden_dim] for PCA
    n_pairs, n_layers, hidden_dim = diffs.shape
    diffs_flat = diffs.reshape(n_pairs, -1).numpy()

    # PCA
    pca = PCA(n_components=n_components)
    pca.fit(diffs_flat)

    # First component: [n_layers * hidden_dim]
    direction_flat = torch.tensor(pca.components_[0], dtype=torch.float32)

    # Reshape back: [n_layers, hidden_dim]
    direction = direction_flat.reshape(n_layers, hidden_dim)

    return direction, pca.explained_variance_ratio_


def compute_per_layer_direction(
    engage: torch.Tensor,
    deflect: torch.Tensor
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Compute direction separately for each layer.

    This allows identifying which layers have the strongest signal.

    Returns:
        directions: [n_layers, hidden_dim]
        layer_strengths: [n_layers] - norm of direction at each layer
    """
    # Mean difference per layer
    directions = compute_mean_difference(engage, deflect)

    # Compute norm at each layer
    layer_strengths = torch.norm(directions, dim=1)

    return directions, layer_strengths


def validate_direction(
    engage: torch.Tensor,
    deflect: torch.Tensor,
    direction: torch.Tensor,
    holdout_fraction: float = 0.2
) -> Dict:
    """
    Validate direction on held-out pairs.

    Computes:
    - Cosine similarity between predicted and actual deflection direction
    - Classification accuracy using dot product sign
    """
    n_pairs = engage.shape[0]
    n_holdout = int(n_pairs * holdout_fraction)

    # Split
    train_engage = engage[:-n_holdout]
    train_deflect = deflect[:-n_holdout]
    test_engage = engage[-n_holdout:]
    test_deflect = deflect[-n_holdout:]

    # Recompute direction on train set
    train_direction = compute_mean_difference(train_engage, train_deflect)

    # Flatten for dot products
    train_dir_flat = train_direction.flatten()
    train_dir_flat = train_dir_flat / torch.norm(train_dir_flat)

    # Test: for each holdout pair, check if deflect has higher dot product
    # with the direction than engage
    correct = 0
    cosine_sims = []

    for i in range(n_holdout):
        engage_flat = test_engage[i].flatten()
        deflect_flat = test_deflect[i].flatten()

        engage_dot = torch.dot(engage_flat, train_dir_flat)
        deflect_dot = torch.dot(deflect_flat, train_dir_flat)

        # Deflect should have higher activation in deflection direction
        if deflect_dot > engage_dot:
            correct += 1

        # Compute cosine similarity of actual diff to direction
        actual_diff = (deflect_flat - engage_flat)
        actual_diff_norm = actual_diff / (torch.norm(actual_diff) + 1e-8)
        cosine_sim = torch.dot(actual_diff_norm, train_dir_flat).item()
        cosine_sims.append(cosine_sim)

    return {
        "holdout_accuracy": correct / n_holdout,
        "mean_cosine_similarity": np.mean(cosine_sims),
        "std_cosine_similarity": np.std(cosine_sims),
        "n_holdout": n_holdout,
        "n_train": n_pairs - n_holdout
    }


def main():
    parser = argparse.ArgumentParser(description="Compute deflection direction")
    parser.add_argument(
        "--input",
        type=str,
        default="activations",
        help="Input directory with activation tensors"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="directions",
        help="Output directory for direction vectors"
    )
    parser.add_argument(
        "--method",
        type=str,
        choices=["mean", "pca", "both"],
        default="both",
        help="Method for computing direction"
    )
    args = parser.parse_args()

    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading activations from: {args.input}")
    engage, deflect, metadata = load_activations(args.input)
    print(f"Loaded {metadata['n_pairs']} pairs")
    print(f"Shape: {metadata['shape']['engage']}")

    results = {
        "metadata": metadata,
        "methods": {}
    }

    # Method 1: Mean difference
    if args.method in ["mean", "both"]:
        print("\n--- Mean Difference Method ---")
        mean_direction = compute_mean_difference(engage, deflect)
        print(f"Direction shape: {mean_direction.shape}")
        print(f"Direction norm: {torch.norm(mean_direction):.4f}")

        # Per-layer analysis
        _, layer_strengths = compute_per_layer_direction(engage, deflect)
        top_layers = torch.argsort(layer_strengths, descending=True)[:5]
        print(f"Top 5 layers by direction strength: {top_layers.tolist()}")
        print(f"Layer strengths: {layer_strengths[top_layers].tolist()}")

        # Validation
        validation = validate_direction(engage, deflect, mean_direction)
        print(f"Holdout accuracy: {validation['holdout_accuracy']:.2%}")
        print(f"Mean cosine similarity: {validation['mean_cosine_similarity']:.4f}")

        results["methods"]["mean_difference"] = {
            "direction_norm": torch.norm(mean_direction).item(),
            "top_layers": top_layers.tolist(),
            "layer_strengths": layer_strengths.tolist(),
            "validation": validation
        }

        # Save
        save_file(
            {"direction": mean_direction},
            output_dir / "direction_mean.safetensors"
        )

    # Method 2: PCA
    if args.method in ["pca", "both"]:
        print("\n--- PCA Method ---")
        pca_direction, explained_var = compute_pca_direction(engage, deflect)
        print(f"Direction shape: {pca_direction.shape}")
        print(f"Explained variance (PC1): {explained_var[0]:.4f}")

        # Per-layer strength of PCA direction
        layer_strengths = torch.norm(pca_direction, dim=1)
        top_layers = torch.argsort(layer_strengths, descending=True)[:5]
        print(f"Top 5 layers by direction strength: {top_layers.tolist()}")

        # Validation
        validation = validate_direction(engage, deflect, pca_direction)
        print(f"Holdout accuracy: {validation['holdout_accuracy']:.2%}")
        print(f"Mean cosine similarity: {validation['mean_cosine_similarity']:.4f}")

        results["methods"]["pca"] = {
            "explained_variance": explained_var.tolist(),
            "top_layers": top_layers.tolist(),
            "layer_strengths": layer_strengths.tolist(),
            "validation": validation
        }

        # Save
        save_file(
            {"direction": pca_direction},
            output_dir / "direction_pca.safetensors"
        )

    # Compare methods if both computed
    if args.method == "both":
        print("\n--- Method Comparison ---")
        # Cosine similarity between the two directions
        mean_flat = mean_direction.flatten()
        pca_flat = pca_direction.flatten()
        cos_sim = torch.dot(
            mean_flat / torch.norm(mean_flat),
            pca_flat / torch.norm(pca_flat)
        ).item()
        print(f"Cosine similarity between mean and PCA directions: {cos_sim:.4f}")
        results["method_comparison"] = {
            "cosine_similarity": cos_sim
        }

    # Save results
    with open(output_dir / "results.json", "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to: {output_dir}")
    print("Files:")
    if args.method in ["mean", "both"]:
        print(f"  - direction_mean.safetensors")
    if args.method in ["pca", "both"]:
        print(f"  - direction_pca.safetensors")
    print(f"  - results.json")


if __name__ == "__main__":
    main()
