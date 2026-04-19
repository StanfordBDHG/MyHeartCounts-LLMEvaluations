"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from llm_response_json_utils import parse_llm_response_as_json_array


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Expand each row's llmResponse JSON array into one row per nudge. "
            "If each llmResponse has 7 nudges, output row count is 7x input rows."
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
            "'_expanded-all-nudges' suffix."
        ),
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail immediately if any row cannot be parsed as a non-empty nudge array.",
    )
    return parser.parse_args()


def default_output_path(input_csv: Path) -> Path:
    return input_csv.with_name(f"{input_csv.stem}_expanded-all-nudges{input_csv.suffix}")


def normalize_nudge_entry(nudge: Any) -> dict[str, str]:
    if isinstance(nudge, dict):
        title = str(nudge.get("title", "")).strip()
        body = str(nudge.get("body", "")).strip()
        return {"title": title, "body": body}

    # Fallback: preserve non-dict nudge content as body text.
    return {"title": "", "body": str(nudge).strip()}


def expand_rows(input_csv: Path, output_csv: Path, strict: bool) -> None:
    with input_csv.open("r", encoding="utf-8", newline="") as infile:
        reader = csv.DictReader(infile)
        input_columns = reader.fieldnames or []

        if not input_columns:
            raise ValueError(f"Input CSV has no header columns: {input_csv}")
        if "llmResponse" not in input_columns:
            raise ValueError("Input CSV must include an 'llmResponse' column.")

        output_columns = [column for column in input_columns if column != "llmResponse"] + [
            "nudgeIndex",
            "nudgeJson",
        ]

        output_csv.parent.mkdir(parents=True, exist_ok=True)
        with output_csv.open("w", encoding="utf-8", newline="") as outfile:
            writer = csv.DictWriter(outfile, fieldnames=output_columns)
            writer.writeheader()

            input_rows = 0
            written_rows = 0
            skipped_rows = 0

            for row in reader:
                input_rows += 1

                try:
                    nudges = parse_llm_response_as_json_array(row.get("llmResponse", ""))
                    if not nudges:
                        raise ValueError("Parsed nudge list is empty.")

                    for index, nudge in enumerate(nudges, start=1):
                        output_row = {column: row.get(column, "") for column in output_columns}
                        output_row["nudgeIndex"] = str(index)
                        output_row["nudgeJson"] = json.dumps(
                            normalize_nudge_entry(nudge), ensure_ascii=False
                        )
                        writer.writerow(output_row)
                        written_rows += 1
                except Exception as error:
                    if strict:
                        raise ValueError(f"Row {input_rows} failed: {error}") from error
                    skipped_rows += 1
                    print(f"Skipping row {input_rows}: {error}")

    print(f"Input: {input_csv}")
    print(f"Output (all nudges expanded): {output_csv}")
    print(f"Input rows processed: {input_rows}")
    print(f"Input rows skipped: {skipped_rows}")
    print(f"Output rows written: {written_rows}")


def main() -> None:
    args = parse_args()
    input_csv = args.input.resolve()
    output_csv = args.output.resolve() if args.output is not None else default_output_path(input_csv)
    expand_rows(
        input_csv=input_csv,
        output_csv=output_csv,
        strict=args.strict,
    )


if __name__ == "__main__":
    main()
