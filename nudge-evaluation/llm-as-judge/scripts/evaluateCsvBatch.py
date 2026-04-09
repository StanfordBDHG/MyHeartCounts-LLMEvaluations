#!/usr/bin/env python3
#
# This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
#
# SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
#
# SPDX-License-Identifier: MIT
#

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


DEFAULT_CSV = (
    "data/generated/nudge-curation-v1/"
    "nudge_permutations_results_multi-provider_7models_from-json_sampled-single-nudge.csv"
)

CONTEXT_FIELDS = [
    "genderIdentity",
    "ageGroup",
    "disease",
    "stageOfChange",
    "educationLevel",
    "language",
    "preferredNotificationTime",
    "genderContext",
    "ageContext",
    "diseaseContext",
    "stageContext",
    "educationContext",
    "languageContext",
    "notificationTimeContext",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Batch-run llm-as-judge over nudges in a generated CSV.",
    )
    parser.add_argument(
        "--csv-input",
        default=DEFAULT_CSV,
        help="Input CSV with sampledNudgeJson column.",
    )
    parser.add_argument(
        "--max-nudges",
        type=int,
        default=49,
        help="Maximum number of rows/nudges to evaluate.",
    )
    parser.add_argument(
        "--model-id",
        default="gpt-5",
        help="Model id passed to llm-as-judge (default: securegpt gpt-5).",
    )
    parser.add_argument(
        "--strategy",
        default="axis-batched-grouped",
        choices=["single", "axis-batched-grouped", "two-stage"],
        help="Judge strategy to use.",
    )
    parser.add_argument(
        "--input-cache-dir",
        default="data/evaluated/llm_as_judge_inputs_all49",
        help="Directory for generated nudge input JSON files.",
    )
    parser.add_argument(
        "--output-dir",
        default="data/evaluated/llm_as_judge_outputs_all49",
        help="Directory for judge output JSON/CSV files.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip rows whose output JSON+CSV already exist.",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Stop immediately on first judge command failure.",
    )
    return parser.parse_args()


def get_repo_root() -> Path:
    # .../nudge-evaluation/llm-as-judge/scripts/evaluateCsvBatch.py -> repo root
    return Path(__file__).resolve().parents[3]


def build_nudge_payload(row: dict[str, str], row_index: int) -> dict[str, Any]:
    sampled_nudge_raw = row.get("sampledNudgeJson", "")
    if not sampled_nudge_raw:
        raise ValueError("Row missing sampledNudgeJson")

    sampled_nudge = json.loads(sampled_nudge_raw)
    title = sampled_nudge.get("title")
    body = sampled_nudge.get("body")
    if not title or not body:
        raise ValueError("sampledNudgeJson must contain title and body")

    context = {field: row[field] for field in CONTEXT_FIELDS if row.get(field)}
    sampled_index = row.get("sampledNudgeIndex", "").strip() or "na"

    return {
        "nudgeId": f"batch-row-{row_index}-sample-{sampled_index}",
        "title": title,
        "body": body,
        "context": context,
    }


def run_one(
    repo_root: Path,
    input_json_path: Path,
    output_json_path: Path,
    output_csv_path: Path,
    model_id: str,
    strategy: str,
) -> int:
    cmd = [
        "npm",
        "--prefix",
        "nudge-evaluation/llm-as-judge",
        "run",
        "judge",
        "--",
        "--model-id",
        model_id,
        "--strategy",
        strategy,
        "--input",
        str(input_json_path),
        "--output-json",
        str(output_json_path),
        "--output-csv",
        str(output_csv_path),
    ]
    result = subprocess.run(cmd, cwd=repo_root)
    return result.returncode


def main() -> int:
    args = parse_args()
    repo_root = get_repo_root()

    csv_path = (repo_root / args.csv_input).resolve()
    input_cache_dir = (repo_root / args.input_cache_dir).resolve()
    output_dir = (repo_root / args.output_dir).resolve()
    input_cache_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not csv_path.exists():
        print(f"Input CSV not found: {csv_path}", file=sys.stderr)
        return 1

    succeeded = 0
    failed = 0
    skipped = 0
    safe_model_id = args.model_id.replace("/", "_")

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row_index, row in enumerate(reader, start=1):
            if row_index > args.max_nudges:
                break

            input_json_path = input_cache_dir / f"nudge_{row_index:03d}.json"
            output_json_path = output_dir / f"nudge_{row_index:03d}_{safe_model_id}.json"
            output_csv_path = output_dir / f"nudge_{row_index:03d}_{safe_model_id}.csv"

            if (
                args.skip_existing
                and output_json_path.exists()
                and output_csv_path.exists()
            ):
                skipped += 1
                print(f"[skip] row {row_index}: outputs already exist")
                continue

            try:
                payload = build_nudge_payload(row, row_index)
            except Exception as error:
                failed += 1
                print(f"[error] row {row_index}: cannot parse nudge: {error}")
                if args.fail_fast:
                    break
                continue

            input_json_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

            print(
                f"[run] row {row_index}: {input_json_path.name} -> {output_json_path.name}"
            )
            return_code = run_one(
                repo_root=repo_root,
                input_json_path=input_json_path,
                output_json_path=output_json_path,
                output_csv_path=output_csv_path,
                model_id=args.model_id,
                strategy=args.strategy,
            )
            if return_code == 0:
                succeeded += 1
            else:
                failed += 1
                print(f"[error] row {row_index}: judge command failed with {return_code}")
                if args.fail_fast:
                    break

    print(
        f"Done. succeeded={succeeded}, failed={failed}, skipped={skipped}, "
        f"requested={args.max_nudges}"
    )
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

