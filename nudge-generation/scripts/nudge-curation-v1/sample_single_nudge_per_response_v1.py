"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

from llm_response_json_utils import parse_llm_response_as_json_array


CONTEXT_COLUMNS = [
    "modelId",
    "provider",
    "backendType",
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
    "fullPrompt",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Deterministically sample exactly one nudge (index 1-7) from each "
            "LLM response row in a nudge permutations CSV."
        )
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Input CSV path.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "Optional output CSV path. If omitted, writes next to input with "
            "'_sampled-single-nudge' suffix."
        ),
    )
    parser.add_argument(
        "--index-output",
        type=Path,
        default=None,
        help=(
            "Optional output CSV path for index-only rows (metadata + sampledNudgeIndex). "
            "If omitted, writes next to input with '_sampled-single-nudge-indexes' suffix."
        ),
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail immediately if any row cannot be parsed or has fewer than 7 nudges.",
    )
    return parser.parse_args()


def default_output_path(input_csv: Path) -> Path:
    return input_csv.with_name(f"{input_csv.stem}_sampled-single-nudge{input_csv.suffix}")


def default_index_output_path(input_csv: Path) -> Path:
    return input_csv.with_name(f"{input_csv.stem}_sampled-single-nudge-indexes{input_csv.suffix}")


def deterministic_nudge_index(row: dict[str, str]) -> int:
    seed_material = "||".join((row.get(col, "") or "").strip() for col in CONTEXT_COLUMNS)
    digest = hashlib.sha256(seed_material.encode("utf-8")).hexdigest()
    return (int(digest, 16) % 7) + 1


def normalize_nudge_entry(nudge: dict[str, Any]) -> dict[str, str]:
    title = str(nudge.get("title", "")).strip()
    body = str(nudge.get("body", "")).strip()
    return {"title": title, "body": body}


def sample_rows(input_csv: Path, output_csv: Path, index_output_csv: Path, strict: bool) -> None:
    with input_csv.open("r", encoding="utf-8", newline="") as infile:
        reader = csv.DictReader(infile)
        input_columns = reader.fieldnames or []

        if not input_columns:
            raise ValueError(f"Input CSV has no header columns: {input_csv}")
        if "llmResponse" not in input_columns:
            raise ValueError("Input CSV must include an 'llmResponse' column.")

        output_columns = [column for column in input_columns if column != "llmResponse"] + [
            "sampledNudgeIndex",
            "sampledNudgeJson",
        ]
        index_output_columns = [column for column in input_columns if column != "llmResponse"] + [
            "sampledNudgeIndex"
        ]

        output_csv.parent.mkdir(parents=True, exist_ok=True)
        index_output_csv.parent.mkdir(parents=True, exist_ok=True)
        with output_csv.open("w", encoding="utf-8", newline="") as outfile:
            with index_output_csv.open("w", encoding="utf-8", newline="") as index_outfile:
                writer = csv.DictWriter(outfile, fieldnames=output_columns)
                index_writer = csv.DictWriter(index_outfile, fieldnames=index_output_columns)
                writer.writeheader()
                index_writer.writeheader()

                total_rows = 0
                sampled_rows = 0
                skipped_rows = 0

                for row in reader:
                    total_rows += 1
                    sampled_index = deterministic_nudge_index(row)
                    index_output_row = {
                        column: row.get(column, "") for column in index_output_columns
                    }
                    index_output_row["sampledNudgeIndex"] = str(sampled_index)
                    index_writer.writerow(index_output_row)

                    try:
                        nudges = parse_llm_response_as_json_array(row.get("llmResponse", ""))
                        if len(nudges) < 7:
                            raise ValueError(f"Expected at least 7 nudges, found {len(nudges)}.")

                        sampled_nudge = normalize_nudge_entry(nudges[sampled_index - 1])

                        output_row = {column: row.get(column, "") for column in output_columns}
                        output_row["sampledNudgeIndex"] = str(sampled_index)
                        output_row["sampledNudgeJson"] = json.dumps(sampled_nudge, ensure_ascii=False)
                        writer.writerow(output_row)
                        sampled_rows += 1
                    except Exception as error:
                        if strict:
                            raise ValueError(f"Row {total_rows} failed: {error}") from error
                        skipped_rows += 1
                        print(f"Skipping row {total_rows}: {error}")

    print(f"Input: {input_csv}")
    print(f"Output (sampled nudge JSON): {output_csv}")
    print(f"Output (index-only, all rows): {index_output_csv}")
    print(f"Rows processed: {total_rows}")
    print(f"Rows written (sampled nudge JSON): {sampled_rows}")
    print(f"Rows skipped (sampled nudge JSON): {skipped_rows}")
    print(f"Rows written (index-only): {total_rows}")


def main() -> None:
    args = parse_args()
    input_csv = args.input.resolve()
    output_csv = args.output.resolve() if args.output is not None else default_output_path(input_csv)
    index_output_csv = (
        args.index_output.resolve()
        if args.index_output is not None
        else default_index_output_path(input_csv)
    )
    sample_rows(
        input_csv=input_csv,
        output_csv=output_csv,
        index_output_csv=index_output_csv,
        strict=args.strict,
    )


if __name__ == "__main__":
    main()
