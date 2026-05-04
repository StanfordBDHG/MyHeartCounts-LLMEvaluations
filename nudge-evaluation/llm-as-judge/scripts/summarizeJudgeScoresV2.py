#!/usr/bin/env python3
#
# This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
#
# SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
#
# SPDX-License-Identifier: MIT
#

"""Summarize LLM-as-judge score CSVs in a directory.

Computes mean/median/std overall and per axis/question, and reports the
frequency + proportion of scores strictly less than a threshold
(default 5) for each axis. Writes the results as a markdown report.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any


LOW_SCORE_THRESHOLD = 5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="Directory containing judge output CSVs (one per nudge).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output markdown file path.",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        default=None,
        help=(
            "Optional path for the structured JSON sidecar. If omitted, defaults to "
            "'<output_dir>/analysis_temp/<output_stem>.json' so the JSON lands alongside "
            "other analysis artifacts."
        ),
    )
    parser.add_argument(
        "--low-threshold",
        type=int,
        default=LOW_SCORE_THRESHOLD,
        help="Scores strictly less than this are counted as 'low' (default: 5).",
    )
    parser.add_argument(
        "--csv-glob",
        default="*.csv",
        help="Glob pattern for CSVs inside --input-dir (default: '*.csv').",
    )
    return parser.parse_args()


def load_rows(input_dir: Path, csv_glob: str) -> tuple[list[dict[str, str]], list[Path]]:
    csv_paths = sorted(input_dir.glob(csv_glob))
    rows: list[dict[str, str]] = []
    for path in csv_paths:
        with path.open("r", encoding="utf-8", newline="") as infile:
            reader = csv.DictReader(infile)
            for row in reader:
                row["_source_file"] = path.name
                rows.append(row)
    return rows, csv_paths


def parse_score(raw: str) -> int | None:
    if raw is None:
        return None
    value = raw.strip()
    if value == "":
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def summarize(scores: list[int]) -> dict[str, float | int]:
    if not scores:
        return {
            "count": 0,
            "mean": math.nan,
            "median": math.nan,
            "std": math.nan,
            "min": math.nan,
            "max": math.nan,
        }
    mean = statistics.fmean(scores)
    median = statistics.median(scores)
    std = statistics.pstdev(scores) if len(scores) > 1 else 0.0
    return {
        "count": len(scores),
        "mean": mean,
        "median": median,
        "std": std,
        "min": min(scores),
        "max": max(scores),
    }


def fmt_number(value: float, decimals: int = 2) -> str:
    if isinstance(value, float) and math.isnan(value):
        return "—"
    if isinstance(value, int):
        return str(value)
    return f"{value:.{decimals}f}"


def compute_histogram(
    scores: list[int], value_range: tuple[int, int]
) -> dict[int, int]:
    """Return a count-per-bin dict covering ``value_range`` inclusive.

    Scores outside the range are still counted under their own integer key so the
    total equals ``len(scores)``; callers that only want the nominal bins can
    filter to keys in ``range(lo, hi + 1)``.
    """
    lo, hi = value_range
    counts = {v: 0 for v in range(lo, hi + 1)}
    for s in scores:
        if s in counts:
            counts[s] += 1
        else:
            counts.setdefault(s, 0)
            counts[s] += 1
    return counts


def render_histogram_block(
    question: str,
    axis_group: str,
    scores: list[int],
    value_range: tuple[int, int],
    bar_char: str = "█",
    max_width: int = 40,
) -> list[str]:
    """Return markdown lines for a fenced ASCII histogram of a single question."""
    counts = compute_histogram(scores, value_range)
    total = sum(counts.values()) or 1
    peak = max(counts.values()) if counts else 0

    value_width = max(len(str(v)) for v in counts)
    count_width = max(len(str(c)) for c in counts.values()) if counts else 1

    lines = [
        f"### `{question}` ({axis_group or '—'})  —  N={total}",
        "",
        "```",
    ]
    for v in sorted(counts.keys()):
        c = counts[v]
        pct = c / total
        bar_len = 0 if peak == 0 else round((c / peak) * max_width)
        bar = bar_char * bar_len if bar_len > 0 else ""
        lines.append(
            f"{str(v).rjust(value_width)} | {bar.ljust(max_width)} {str(c).rjust(count_width)} ({pct:>5.1%})"
        )
    lines.append("```")
    lines.append("")
    return lines


def histogram_to_serializable(
    scores: list[int], value_range: tuple[int, int]
) -> dict[str, Any]:
    """JSON-friendly histogram payload: ordered bins with counts and proportions."""
    counts = compute_histogram(scores, value_range)
    total = sum(counts.values())
    return {
        "value_range": list(value_range),
        "n": total,
        "bins": [
            {
                "value": value,
                "count": count,
                "proportion": (count / total) if total else 0.0,
            }
            for value, count in sorted(counts.items())
        ],
    }


def main() -> None:
    args = parse_args()
    input_dir: Path = args.input_dir.resolve()
    output_path: Path = args.output.resolve()
    threshold: int = args.low_threshold

    rows, csv_paths = load_rows(input_dir, args.csv_glob)
    if not rows:
        raise SystemExit(f"No rows loaded from {input_dir}")

    # Group scores by question (stable_key) and track its broad axis category + response_type.
    scores_by_question: dict[str, list[int]] = defaultdict(list)
    response_type_by_question: dict[str, str] = {}
    axis_group_by_question: dict[str, str] = {}
    question_order: list[str] = []

    overall_scores: list[int] = []
    overall_likert_scores: list[int] = []
    overall_yes_no_scores: list[int] = []

    for row in rows:
        question = (row.get("stable_key") or "").strip()
        if not question:
            # Fall back to the axis column if stable_key is missing.
            question = (row.get("axis") or "").strip()
        if not question:
            continue
        score = parse_score(row.get("score_int", ""))
        if score is None:
            continue

        if question not in scores_by_question:
            question_order.append(question)
        scores_by_question[question].append(score)
        response_type_by_question.setdefault(
            question, (row.get("response_type") or "").strip()
        )
        axis_group_by_question.setdefault(question, (row.get("axis") or "").strip())

        overall_scores.append(score)
        response_type = (row.get("response_type") or "").strip()
        if response_type == "likert_1_7":
            overall_likert_scores.append(score)
        elif response_type == "yes_no":
            overall_yes_no_scores.append(score)

    overall_stats = summarize(overall_scores)
    likert_stats = summarize(overall_likert_scores)
    yes_no_stats = summarize(overall_yes_no_scores)

    # Per-question stats + low-score counts.
    question_rows: list[dict[str, Any]] = []
    for question in question_order:
        scores = scores_by_question[question]
        stats = summarize(scores)
        low_count = sum(1 for s in scores if s < threshold)
        low_prop = low_count / len(scores) if scores else math.nan
        question_rows.append(
            {
                "question": question,
                "axis_group": axis_group_by_question.get(question, ""),
                "response_type": response_type_by_question.get(question, ""),
                "count": stats["count"],
                "mean": stats["mean"],
                "median": stats["median"],
                "std": stats["std"],
                "min": stats["min"],
                "max": stats["max"],
                "low_count": low_count,
                "low_proportion": low_prop,
            }
        )

    # Ranking: questions with most scores < threshold (by absolute count).
    ranked_by_low_count = sorted(
        question_rows,
        key=lambda r: (
            -int(r["low_count"]),
            -float(r["low_proportion"]) if not math.isnan(float(r["low_proportion"])) else 0.0,
            r["question"],
        ),
    )

    # Separate rankings for likert vs yes_no to make them comparable.
    likert_questions = [r for r in question_rows if r["response_type"] == "likert_1_7"]
    yes_no_questions = [r for r in question_rows if r["response_type"] == "yes_no"]
    ranked_likert_by_low_count = sorted(
        likert_questions,
        key=lambda r: (-int(r["low_count"]), -float(r["low_proportion"]), r["question"]),
    )
    ranked_yes_no_by_low_count = sorted(
        yes_no_questions,
        key=lambda r: (-int(r["low_count"]), -float(r["low_proportion"]), r["question"]),
    )

    # Build markdown report.
    lines: list[str] = []
    lines.append("# LLM-as-judge score summary (v2)")
    lines.append("")
    lines.append(f"Source directory: `{input_dir}`  ")
    lines.append(f"CSV files scanned: **{len(csv_paths)}**  ")
    lines.append(f"Total scored axis evaluations: **{len(overall_scores)}**  ")
    lines.append(f"Low-score threshold: **score < {threshold}**")
    lines.append("")
    # Report observed response-type ranges so readers know what "< threshold" means for each kind.
    likert_range = (
        (min(overall_likert_scores), max(overall_likert_scores))
        if overall_likert_scores else None
    )
    yes_no_range = (
        (min(overall_yes_no_scores), max(overall_yes_no_scores))
        if overall_yes_no_scores else None
    )
    lines.append("Score types present in this data:")
    lines.append("")
    lines.append(
        "- `likert_1_7`: nominal scale 1..7 (higher is better). "
        + (f"Observed range in this data: {likert_range[0]}..{likert_range[1]}." if likert_range else "")
    )
    lines.append(
        "- `yes_no`: binary axis encoded on a 1..7 scale where **1 = no** and **7 = yes**. "
        + (
            f"Observed range in this data: {yes_no_range[0]}..{yes_no_range[1]}."
            if yes_no_range else ""
        )
    )
    lines.append("")
    lines.append(
        f"The `< {threshold}` threshold is applied uniformly. On a Likert-scale axis this flags "
        f"weaker-than-neutral scores; on yes_no axes `< {threshold}` effectively flags the **no** "
        "side of the scale (any score below the midpoint is leaning toward no)."
    )
    lines.append("")

    lines.append("## Overall")
    lines.append("")
    lines.append("| Scope | N | Mean | Median | Std (pop.) | Min | Max |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for label, stats in [
        ("All scores (all response types)", overall_stats),
        ("Likert-scale scores only", likert_stats),
        ("Yes/No (1 = no, 7 = yes) scores only", yes_no_stats),
    ]:
        lines.append(
            "| {label} | {n} | {mean} | {median} | {std} | {mn} | {mx} |".format(
                label=label,
                n=stats["count"],
                mean=fmt_number(stats["mean"]),
                median=fmt_number(stats["median"]),
                std=fmt_number(stats["std"]),
                mn=fmt_number(stats["min"], 0),
                mx=fmt_number(stats["max"], 0),
            )
        )
    lines.append("")

    # Overall low-score totals.
    overall_low = sum(1 for s in overall_scores if s < threshold)
    likert_low = sum(1 for s in overall_likert_scores if s < threshold)
    yes_no_low = sum(1 for s in overall_yes_no_scores if s < threshold)
    lines.append(f"- Scores `< {threshold}` overall: **{overall_low} / {len(overall_scores)} "
                 f"({overall_low / len(overall_scores):.1%})**")
    if overall_likert_scores:
        lines.append(f"- Scores `< {threshold}` among Likert-scale: **{likert_low} / {len(overall_likert_scores)} "
                     f"({likert_low / len(overall_likert_scores):.1%})**")
    if overall_yes_no_scores:
        lines.append(
            f"- Scores `< {threshold}` among yes_no (i.e. leaning toward **no**): "
            f"**{yes_no_low} / {len(overall_yes_no_scores)} "
            f"({yes_no_low / len(overall_yes_no_scores):.1%})**"
        )
    lines.append("")

    # Per-question table.
    lines.append("## Per-question stats")
    lines.append("")
    lines.append(
        "| Question (stable_key) | Axis group | Response type | N | Mean | Median | Std (pop.) | Min | Max | Scores < {t} | Proportion < {t} |".format(t=threshold)
    )
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for row in question_rows:
        lines.append(
            "| `{q}` | {grp} | {rt} | {n} | {mean} | {median} | {std} | {mn} | {mx} | {lc} | {lp} |".format(
                q=row["question"],
                grp=row["axis_group"] or "—",
                rt=row["response_type"] or "—",
                n=row["count"],
                mean=fmt_number(float(row["mean"])),
                median=fmt_number(float(row["median"])),
                std=fmt_number(float(row["std"])),
                mn=fmt_number(float(row["min"]), 0),
                mx=fmt_number(float(row["max"]), 0),
                lc=row["low_count"],
                lp=(f"{float(row['low_proportion']):.1%}" if not math.isnan(float(row["low_proportion"])) else "—"),
            )
        )
    lines.append("")

    # Histogram value ranges (shared by markdown rendering and the JSON sidecar).
    # yes_no uses the same 1..7 axis as likert: 1 = no, 7 = yes.
    likert_hist_range: tuple[int, int] = (1, 7)
    yes_no_hist_range: tuple[int, int] = (1, 7)

    # Frequency histograms: one per likert_1_7 question, plus one per yes_no question.
    lines.append("## Likert-scale frequency histograms")
    lines.append("")
    lines.append(
        "Each histogram shows the distribution of integer scores for a single question. "
        "Bars are scaled relative to the most-frequent bin within that question."
    )
    lines.append("")
    if likert_questions:
        for row in likert_questions:
            scores = scores_by_question[row["question"]]
            lines.extend(
                render_histogram_block(
                    question=str(row["question"]),
                    axis_group=str(row["axis_group"]),
                    scores=scores,
                    value_range=likert_hist_range,
                )
            )
    else:
        lines.append("_No Likert-scale questions found in the data._")
        lines.append("")

    if yes_no_questions:
        lines.append("## Yes/No frequency histograms")
        lines.append("")
        lines.append(
            "Yes/No axes use a 1..7 scale where **1 = no** and **7 = yes** "
            "(the endpoints are the only semantically meaningful values; intermediate values, "
            "if present, represent weaker signals toward the nearer endpoint)."
        )
        lines.append("")
        for row in yes_no_questions:
            scores = scores_by_question[row["question"]]
            lines.extend(
                render_histogram_block(
                    question=str(row["question"]),
                    axis_group=str(row["axis_group"]),
                    scores=scores,
                    value_range=yes_no_hist_range,
                )
            )

    # Rankings: most "low" scores.
    def render_ranking(title: str, ranked: list[dict[str, Any]], note: str = "") -> None:
        lines.append(f"## {title}")
        lines.append("")
        if note:
            lines.append(note)
            lines.append("")
        lines.append(
            f"| Rank | Question | Axis group | Response type | N | Scores < {threshold} | Proportion < {threshold} | Mean |"
        )
        lines.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
        for i, r in enumerate(ranked, start=1):
            lines.append(
                "| {rank} | `{q}` | {grp} | {rt} | {n} | {lc} | {lp} | {mean} |".format(
                    rank=i,
                    q=r["question"],
                    grp=r["axis_group"] or "—",
                    rt=r["response_type"] or "—",
                    n=r["count"],
                    lc=r["low_count"],
                    lp=(f"{float(r['low_proportion']):.1%}"
                        if not math.isnan(float(r["low_proportion"])) else "—"),
                    mean=fmt_number(float(r["mean"])),
                )
            )
        lines.append("")

    render_ranking(
        f"Questions with the most scores < {threshold} (all response types)",
        ranked_by_low_count,
    )
    if likert_questions:
        render_ranking(
            f"Likert-scale questions ranked by # of scores < {threshold}",
            ranked_likert_by_low_count,
        )
    if yes_no_questions:
        render_ranking(
            f"Yes/No questions ranked by # of **no** verdicts (score < {threshold})",
            ranked_yes_no_by_low_count,
            note=(
                "On yes_no axes, **1 = no** and **7 = yes** on a 1..7 scale. "
                f"`< {threshold}` captures everything on the **no** side of the midpoint, "
                "so a higher count/proportion here means the judge was more often answering "
                "'no' on that question."
            ),
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Build structured JSON sidecar so every value in the markdown has a machine-readable twin.
    def hist_range_for(response_type: str) -> tuple[int, int]:
        if response_type == "likert_1_7":
            return likert_hist_range
        if response_type == "yes_no":
            return yes_no_hist_range
        # Fallback: span the observed integer range.
        scores = scores_by_question.get("", [])
        return (1, 7) if not scores else (min(scores), max(scores))

    def stats_with_low(scores: list[int]) -> dict[str, Any]:
        stats = summarize(scores)
        low_count = sum(1 for s in scores if s < threshold)
        low_prop = (low_count / len(scores)) if scores else float("nan")
        return {
            **stats,
            "low_count": low_count,
            "low_proportion": low_prop,
        }

    def clean_for_json(value: Any) -> Any:
        if isinstance(value, float) and math.isnan(value):
            return None
        if isinstance(value, dict):
            return {k: clean_for_json(v) for k, v in value.items()}
        if isinstance(value, list):
            return [clean_for_json(v) for v in value]
        return value

    json_per_question: list[dict[str, Any]] = []
    for row in question_rows:
        question = str(row["question"])
        response_type = str(row["response_type"])
        scores = scores_by_question[question]
        value_range = hist_range_for(response_type)
        json_per_question.append(
            {
                "question": question,
                "axis_group": row["axis_group"] or None,
                "response_type": response_type or None,
                "count": row["count"],
                "mean": row["mean"],
                "median": row["median"],
                "std": row["std"],
                "min": row["min"],
                "max": row["max"],
                "low_count": row["low_count"],
                "low_proportion": row["low_proportion"],
                "histogram": histogram_to_serializable(scores, value_range),
            }
        )

    json_payload: dict[str, Any] = {
        "meta": {
            "input_dir": str(input_dir),
            "csv_glob": args.csv_glob,
            "csv_files_scanned": len(csv_paths),
            "csv_file_names": [p.name for p in csv_paths],
            "total_scores": len(overall_scores),
            "questions": len(question_rows),
            "low_threshold": threshold,
            "likert_observed_range": (
                [min(overall_likert_scores), max(overall_likert_scores)]
                if overall_likert_scores else None
            ),
            "yes_no_observed_range": (
                [min(overall_yes_no_scores), max(overall_yes_no_scores)]
                if overall_yes_no_scores else None
            ),
            "likert_histogram_range": list(likert_hist_range),
            "yes_no_histogram_range": list(yes_no_hist_range),
        },
        "overall": {
            "all": stats_with_low(overall_scores),
            "likert": stats_with_low(overall_likert_scores),
            "yes_no": stats_with_low(overall_yes_no_scores),
        },
        "per_question": json_per_question,
        "rankings": {
            "all_by_low_count": [str(r["question"]) for r in ranked_by_low_count],
            "likert_by_low_count": [str(r["question"]) for r in ranked_likert_by_low_count],
            "yes_no_by_low_count": [str(r["question"]) for r in ranked_yes_no_by_low_count],
        },
    }

    if args.json_output is not None:
        json_output_path: Path = args.json_output.resolve()
    else:
        json_output_path = (
            output_path.parent / "analysis_temp" / f"{output_path.stem}.json"
        )
    json_output_path.parent.mkdir(parents=True, exist_ok=True)
    with json_output_path.open("w", encoding="utf-8") as json_file:
        json.dump(clean_for_json(json_payload), json_file, indent=2, allow_nan=False)
        json_file.write("\n")

    print(f"Files scanned: {len(csv_paths)}")
    print(f"Total scores: {len(overall_scores)}")
    print(f"Questions (stable_key): {len(question_rows)}")
    print(f"Wrote {output_path}")
    print(f"Wrote {json_output_path}")


if __name__ == "__main__":
    main()
