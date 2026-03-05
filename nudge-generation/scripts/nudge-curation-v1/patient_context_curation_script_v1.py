"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import random
from pathlib import Path
from typing import Any, Callable, cast

SCRIPT_DIR = Path(__file__).resolve().parent
SCRIPTS_ROOT = SCRIPT_DIR.parent
PROMPT_LOADER_PATH = SCRIPTS_ROOT / "lib" / "prompt_constants_loader.py"


def _load_build_prompt() -> Callable[[dict[str, Any]], str]:
    spec = importlib.util.spec_from_file_location(
        "nudge_prompt_constants_loader", PROMPT_LOADER_PATH
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load prompt constants loader at {PROMPT_LOADER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(Callable[[dict[str, Any]], str], module.build_prompt)


build_prompt = _load_build_prompt()


AGE_GROUPS = ["<35", "35-50", "51-65", ">65"]
GENDERS = ["male", "female"]
STAGES_OF_CHANGE = [
    "Precontemplation",
    "Contemplation",
    "Preparation",
    "Action",
    "Maintenance",
]
EDUCATION_LEVELS = ["Highschool", "college"]
ACTIVITY_TYPES = ["HIIT", "walk", "swim", "run", "sport", "strength", "bicycle", "yoga/pilates"]
NOTIFICATION_TIMES = ["7:00 AM", "12:00 PM", "6:00 PM"]

# Required disease distribution:
# - 2 disease-free contexts (None)
# - 1 each for the five disease categories below
DISEASE_BUCKETS = [
    None,
    None,
    "Heart failure",
    "Pulmonary arterial hypertension",
    "Diabetes",
    "ACHD (simple)",
    "ACHD (complex)",
]


def build_curated_contexts(seed: int) -> list[dict[str, Any]]:
    """Build 7 patient contexts with deterministic randomness and fixed disease mix."""
    rng = random.Random(seed)
    disease_values = DISEASE_BUCKETS.copy()
    rng.shuffle(disease_values)

    contexts: list[dict[str, Any]] = []
    for disease in disease_values:
        context = {
            "genderIdentity": rng.choice(GENDERS),
            "ageGroup": rng.choice(AGE_GROUPS),
            "disease": disease,
            "stageOfChange": rng.choice(STAGES_OF_CHANGE),
            "educationLevel": rng.choice(EDUCATION_LEVELS),
            "language": "en",
            # Exactly one activity per context for simplicity.
            "preferredWorkoutTypes": rng.choice(ACTIVITY_TYPES),
            "preferredNotificationTime": rng.choice(NOTIFICATION_TIMES),
        }
        context["fullPrompt"] = build_prompt(context)
        contexts.append(context)
    return contexts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate 7 deterministic, curated patient contexts as JSON."
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Deterministic seed for random sampling (default: 42).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional output path for JSON. If omitted, JSON is printed to stdout.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output with indentation.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    contexts = build_curated_contexts(seed=args.seed)
    indent = 2 if args.pretty else None
    payload = json.dumps(contexts, indent=indent)

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
        print(f"Wrote {len(contexts)} contexts to {args.output}")
    else:
        print(payload)


if __name__ == "__main__":
    main()
