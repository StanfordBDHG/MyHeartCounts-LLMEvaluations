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
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare llm-as-judge scores against preliminary human evaluation data "
            "from a Supabase backup."
        ),
    )
    parser.add_argument(
        "--llm-output-dir",
        default="data/evaluated/llm_as_judge_outputs_all49",
        help="Directory containing llm-as-judge output CSV files.",
    )
    parser.add_argument(
        "--supabase-table-dir",
        default="data/backups/supabase/20260402T221023Z/public/tables",
        help="Directory containing Supabase table CSV files.",
    )
    parser.add_argument(
        "--output-dir",
        default="nudge-evaluation/llm-as-judge/analysis_temp",
        help="Output directory for summary JSON + pairwise CSV artifacts.",
    )
    return parser.parse_args()


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def safe_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2:
        return float("nan")
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denom_x = sum((x - mean_x) ** 2 for x in xs)
    denom_y = sum((y - mean_y) ** 2 for y in ys)
    denominator = (denom_x * denom_y) ** 0.5
    if denominator == 0:
        return float("nan")
    return numerator / denominator


def rank(values: list[float]) -> list[float]:
    # Average-rank tie handling.
    sorted_indices = sorted(range(len(values)), key=lambda idx: values[idx])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(values):
        j = i
        while j + 1 < len(values) and values[sorted_indices[j + 1]] == values[sorted_indices[i]]:
            j += 1
        avg_rank = (i + j + 2) / 2.0
        for k in range(i, j + 1):
            ranks[sorted_indices[k]] = avg_rank
        i = j + 1
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float:
    return pearson(rank(xs), rank(ys))


def main() -> int:
    args = parse_args()

    root = Path(__file__).resolve().parents[3]
    llm_output_dir = root / args.llm_output_dir
    supabase_table_dir = root / args.supabase_table_dir
    output_dir = root / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    llm_rows: list[dict[str, Any]] = []
    for csv_path in sorted(llm_output_dir.glob("*.csv")):
        for row in read_csv_rows(csv_path):
            llm_rows.append(
                {
                    **row,
                    "score_int": safe_float(row.get("score_int")),
                    "source_file": csv_path.name,
                },
            )

    responses = read_csv_rows(supabase_table_dir / "responses.csv")
    questions = read_csv_rows(supabase_table_dir / "questions.csv")
    nudges = read_csv_rows(supabase_table_dir / "nudges.csv")

    question_by_id = {row["id"]: row for row in questions}
    nudge_by_id = {row["id"]: row for row in nudges}

    human_rows: list[dict[str, Any]] = []
    for row in responses:
        score = safe_float(row.get("score_int"))
        question = question_by_id.get(row["question_id"])
        nudge = nudge_by_id.get(row["nudge_id"])
        if score is None or question is None or nudge is None:
            continue
        human_rows.append(
            {
                "human_nudge_id": row["nudge_id"],
                "stable_key": question.get("stable_key", ""),
                "score_int": score,
                "title": nudge.get("title", ""),
                "body": nudge.get("body", ""),
            },
        )

    body_to_human_nudge_ids: dict[str, set[str]] = defaultdict(set)
    title_to_human_nudge_ids: dict[str, set[str]] = defaultdict(set)
    for nudge in nudges:
        if nudge.get("body"):
            body_to_human_nudge_ids[nudge["body"]].add(nudge["id"])
        if nudge.get("title"):
            title_to_human_nudge_ids[nudge["title"]].add(nudge["id"])

    llm_nudges: dict[str, dict[str, str]] = {}
    for row in llm_rows:
        llm_nudges[row["nudge_id"]] = {
            "title": row.get("nudge_title", ""),
            "body": row.get("nudge_body", ""),
        }

    llm_to_human_nudge_id: dict[str, str] = {}
    ambiguous_matches: list[dict[str, Any]] = []
    for llm_nudge_id, meta in llm_nudges.items():
        candidates: set[str] = set()
        if meta["body"] in body_to_human_nudge_ids:
            candidates |= body_to_human_nudge_ids[meta["body"]]
        if not candidates and meta["title"] in title_to_human_nudge_ids:
            candidates |= title_to_human_nudge_ids[meta["title"]]

        if len(candidates) == 1:
            llm_to_human_nudge_id[llm_nudge_id] = next(iter(candidates))
        elif len(candidates) > 1:
            ambiguous_matches.append(
                {
                    "llm_nudge_id": llm_nudge_id,
                    "candidate_human_nudge_ids": sorted(candidates),
                },
            )

    llm_scores_by_pair: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in llm_rows:
        if row["score_int"] is None:
            continue
        human_nudge_id = llm_to_human_nudge_id.get(row["nudge_id"])
        if human_nudge_id is None:
            continue
        llm_scores_by_pair[(human_nudge_id, row["stable_key"])].append(float(row["score_int"]))

    human_scores_by_pair: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in human_rows:
        human_scores_by_pair[(row["human_nudge_id"], row["stable_key"])].append(float(row["score_int"]))

    pair_rows: list[dict[str, Any]] = []
    for pair, llm_scores in llm_scores_by_pair.items():
        if pair not in human_scores_by_pair:
            continue
        human_scores = human_scores_by_pair[pair]
        pair_rows.append(
            {
                "human_nudge_id": pair[0],
                "stable_key": pair[1],
                "llm_mean": sum(llm_scores) / len(llm_scores),
                "llm_n": len(llm_scores),
                "human_mean": sum(human_scores) / len(human_scores),
                "human_median": statistics.median(human_scores),
                "human_n": len(human_scores),
                "human_std": statistics.pstdev(human_scores) if len(human_scores) > 1 else 0.0,
            },
        )

    non_ci_pair_rows = [row for row in pair_rows if not row["stable_key"].startswith("ci_")]
    ci_pair_rows = [row for row in pair_rows if row["stable_key"].startswith("ci_")]

    llm_means = [row["llm_mean"] for row in non_ci_pair_rows]
    human_means = [row["human_mean"] for row in non_ci_pair_rows]
    signed_diffs = [x - y for x, y in zip(llm_means, human_means)]
    abs_diffs = [abs(diff) for diff in signed_diffs]

    if non_ci_pair_rows:
        mae = sum(abs_diffs) / len(abs_diffs)
        rmse = (sum(diff**2 for diff in signed_diffs) / len(signed_diffs)) ** 0.5
        mean_diff = sum(signed_diffs) / len(signed_diffs)
    else:
        mae = float("nan")
        rmse = float("nan")
        mean_diff = float("nan")

    overall = {
        "n_pairs": len(non_ci_pair_rows),
        "n_mapped_human_nudges_in_pairs": len({row["human_nudge_id"] for row in non_ci_pair_rows}),
        "n_stable_keys_in_pairs": len({row["stable_key"] for row in non_ci_pair_rows}),
        "pearson": pearson(llm_means, human_means) if non_ci_pair_rows else float("nan"),
        "spearman": spearman(llm_means, human_means) if non_ci_pair_rows else float("nan"),
        "mae": mae,
        "rmse": rmse,
        "mean_diff_llm_minus_human": mean_diff,
        "ci_excluded": True,
    }

    overall_including_ci = {
        "n_pairs": len(pair_rows),
        "n_mapped_human_nudges_in_pairs": len({row["human_nudge_id"] for row in pair_rows}),
        "n_stable_keys_in_pairs": len({row["stable_key"] for row in pair_rows}),
        "pearson": pearson(
            [row["llm_mean"] for row in pair_rows],
            [row["human_mean"] for row in pair_rows],
        )
        if pair_rows
        else float("nan"),
        "spearman": spearman(
            [row["llm_mean"] for row in pair_rows],
            [row["human_mean"] for row in pair_rows],
        )
        if pair_rows
        else float("nan"),
        "mae": (
            sum(abs(row["llm_mean"] - row["human_mean"]) for row in pair_rows) / len(pair_rows)
            if pair_rows
            else float("nan")
        ),
        "rmse": (
            (
                sum((row["llm_mean"] - row["human_mean"]) ** 2 for row in pair_rows)
                / len(pair_rows)
            )
            ** 0.5
            if pair_rows
            else float("nan")
        ),
        "mean_diff_llm_minus_human": (
            sum(row["llm_mean"] - row["human_mean"] for row in pair_rows) / len(pair_rows)
            if pair_rows
            else float("nan")
        ),
        "ci_excluded": False,
    }

    # Context inclusion (ci_*) as binary classification:
    # 1 -> "no" (negative), 7 -> "yes" (positive).
    llm_ci_rows = [row for row in llm_rows if row.get("stable_key", "").startswith("ci_")]
    human_ci_rows = [row for row in human_rows if row.get("stable_key", "").startswith("ci_")]

    llm_ci_unique_values = sorted(
        {float(row["score_int"]) for row in llm_ci_rows if row.get("score_int") is not None},
    )
    human_ci_unique_values = sorted({float(row["score_int"]) for row in human_ci_rows})

    llm_ci_unexpected_values = [value for value in llm_ci_unique_values if value not in {1.0, 7.0}]
    human_ci_unexpected_values = [value for value in human_ci_unique_values if value not in {1.0, 7.0}]

    # Build single LLM prediction per (human_nudge_id, stable_key) for CI keys.
    llm_ci_pred_by_pair: dict[tuple[str, str], float] = {}
    for row in llm_ci_rows:
        if row["score_int"] is None:
            continue
        human_nudge_id = llm_to_human_nudge_id.get(row["nudge_id"])
        if human_nudge_id is None:
            continue
        llm_ci_pred_by_pair[(human_nudge_id, row["stable_key"])] = float(row["score_int"])

    def compute_binary_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
        tp = fp = tn = fn = 0
        n = 0
        for row in rows:
            pair = (row["human_nudge_id"], row["stable_key"])
            if pair not in llm_ci_pred_by_pair:
                continue
            pred_positive = llm_ci_pred_by_pair[pair] == 7.0
            truth_positive = float(row["score_int"]) == 7.0
            n += 1
            if pred_positive and truth_positive:
                tp += 1
            elif pred_positive and not truth_positive:
                fp += 1
            elif not pred_positive and not truth_positive:
                tn += 1
            else:
                fn += 1

        accuracy = (tp + tn) / n if n else float("nan")
        precision = tp / (tp + fp) if (tp + fp) else float("nan")
        recall = tp / (tp + fn) if (tp + fn) else float("nan")
        specificity = tn / (tn + fp) if (tn + fp) else float("nan")
        if precision == precision and recall == recall and (precision + recall) > 0:
            f1 = 2 * precision * recall / (precision + recall)
        else:
            f1 = float("nan")
        if recall == recall and specificity == specificity:
            balanced_accuracy = (recall + specificity) / 2
        else:
            balanced_accuracy = float("nan")

        return {
            "n": n,
            "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
            "accuracy": accuracy,
            "precision_yes": precision,
            "recall_yes": recall,
            "specificity_no": specificity,
            "f1_yes": f1,
            "balanced_accuracy": balanced_accuracy,
        }

    ci_binary_overall = compute_binary_metrics(human_ci_rows)
    ci_binary_by_key: list[dict[str, Any]] = []
    for stable_key in sorted({row["stable_key"] for row in human_ci_rows}):
        key_rows = [row for row in human_ci_rows if row["stable_key"] == stable_key]
        ci_binary_by_key.append(
            {
                "stable_key": stable_key,
                **compute_binary_metrics(key_rows),
            },
        )

    # Majority-vote variant at pair level, excluding ties.
    human_ci_scores_by_pair: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in human_ci_rows:
        human_ci_scores_by_pair[(row["human_nudge_id"], row["stable_key"])].append(float(row["score_int"]))

    majority_rows: list[dict[str, Any]] = []
    ties_excluded = 0
    for pair, scores in human_ci_scores_by_pair.items():
        no_count = sum(1 for score in scores if score == 1.0)
        yes_count = sum(1 for score in scores if score == 7.0)
        if yes_count == no_count:
            ties_excluded += 1
            continue
        majority_label = 7.0 if yes_count > no_count else 1.0
        majority_rows.append(
            {
                "human_nudge_id": pair[0],
                "stable_key": pair[1],
                "score_int": majority_label,
            },
        )

    ci_binary_majority_overall = compute_binary_metrics(majority_rows)
    ci_binary_majority_by_key: list[dict[str, Any]] = []
    for stable_key in sorted({row["stable_key"] for row in majority_rows}):
        key_rows = [row for row in majority_rows if row["stable_key"] == stable_key]
        ci_binary_majority_by_key.append(
            {
                "stable_key": stable_key,
                **compute_binary_metrics(key_rows),
            },
        )

    by_key: list[dict[str, Any]] = []
    for stable_key in sorted({row["stable_key"] for row in pair_rows}):
        rows = [row for row in pair_rows if row["stable_key"] == stable_key]
        xs = [row["llm_mean"] for row in rows]
        ys = [row["human_mean"] for row in rows]
        by_key.append(
            {
                "stable_key": stable_key,
                "n_pairs": len(rows),
                "llm_avg": sum(xs) / len(xs),
                "human_avg": sum(ys) / len(ys),
                "mae": sum(abs(x - y) for x, y in zip(xs, ys)) / len(rows),
                "pearson": pearson(xs, ys) if len(rows) >= 2 else float("nan"),
                "spearman": spearman(xs, ys) if len(rows) >= 2 else float("nan"),
            },
        )
    by_key.sort(key=lambda row: row["mae"], reverse=True)

    by_nudge: list[dict[str, Any]] = []
    for human_nudge_id in sorted({row["human_nudge_id"] for row in pair_rows}):
        rows = [row for row in pair_rows if row["human_nudge_id"] == human_nudge_id]
        xs = [row["llm_mean"] for row in rows]
        ys = [row["human_mean"] for row in rows]
        by_nudge.append(
            {
                "human_nudge_id": human_nudge_id,
                "title": nudge_by_id.get(human_nudge_id, {}).get("title", ""),
                "n_axes": len(rows),
                "llm_avg": sum(xs) / len(xs),
                "human_avg": sum(ys) / len(ys),
                "mae": sum(abs(x - y) for x, y in zip(xs, ys)) / len(rows),
            },
        )
    by_nudge.sort(key=lambda row: row["mae"], reverse=True)

    diff_distribution = {
        "exact_match_count": sum(1 for diff in signed_diffs if abs(diff) < 1e-9),
        "llm_lower_count": sum(1 for diff in signed_diffs if diff < 0),
        "llm_higher_count": sum(1 for diff in signed_diffs if diff > 0),
        "abs_diff_buckets": {
            "<=0.5": sum(1 for diff in abs_diffs if diff <= 0.5),
            "0.5_to_1": sum(1 for diff in abs_diffs if 0.5 < diff <= 1.0),
            "1_to_2": sum(1 for diff in abs_diffs if 1.0 < diff <= 2.0),
            ">2": sum(1 for diff in abs_diffs if diff > 2.0),
        },
    }

    summary = {
        "overall": overall,
        "counts": {
            "llm_rows": len(llm_rows),
            "llm_unique_nudges": len(llm_nudges),
            "llm_stable_keys": len({row["stable_key"] for row in llm_rows}),
            "human_rows": len(human_rows),
            "human_unique_nudges": len({row["human_nudge_id"] for row in human_rows}),
            "human_stable_keys": len({row["stable_key"] for row in human_rows}),
            "mapped_llm_nudges": len(llm_to_human_nudge_id),
            "unmapped_llm_nudges": len(llm_nudges) - len(llm_to_human_nudge_id),
            "ambiguous_llm_nudges": len(ambiguous_matches),
            "paired_rows_total_including_ci": len(pair_rows),
            "paired_rows_non_ci": len(non_ci_pair_rows),
            "paired_rows_ci": len(ci_pair_rows),
        },
        "overall_including_ci": overall_including_ci,
        "diff_distribution": diff_distribution,
        "context_inclusion_binary": {
            "mapping": {"1": "no", "7": "yes"},
            "value_check": {
                "llm_unique_values": llm_ci_unique_values,
                "human_unique_values": human_ci_unique_values,
                "llm_unexpected_values": llm_ci_unexpected_values,
                "human_unexpected_values": human_ci_unexpected_values,
                "llm_only_1_or_7": len(llm_ci_unexpected_values) == 0,
                "human_only_1_or_7": len(human_ci_unexpected_values) == 0,
            },
            "rater_level": {
                "overall": ci_binary_overall,
                "by_key": ci_binary_by_key,
            },
            "majority_vote_excluding_ties": {
                "ties_excluded": ties_excluded,
                "overall": ci_binary_majority_overall,
                "by_key": ci_binary_majority_by_key,
            },
        },
        "by_key": by_key,
        "by_nudge": by_nudge,
        "ambiguous_matches": ambiguous_matches,
        "unmapped_llm_nudge_ids": sorted(set(llm_nudges) - set(llm_to_human_nudge_id)),
    }

    with (output_dir / "summary.json").open("w", encoding="utf-8") as file:
        json.dump(summary, file, indent=2)

    if pair_rows:
        fieldnames = list(pair_rows[0].keys())
    else:
        fieldnames = ["human_nudge_id", "stable_key", "llm_mean", "human_mean"]
    with (output_dir / "pairs.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for row in pair_rows:
            writer.writerow(row)

    print(f"Wrote summary: {output_dir / 'summary.json'}")
    print(f"Wrote pairwise rows: {output_dir / 'pairs.csv'}")
    print(
        "Overall -> "
        f"pairs={overall['n_pairs']}, "
        f"pearson={overall['pearson']:.3f}, "
        f"spearman={overall['spearman']:.3f}, "
        f"mae={overall['mae']:.3f}, "
        f"rmse={overall['rmse']:.3f}, "
        f"mean_diff={overall['mean_diff_llm_minus_human']:.3f}"
    )
    print(
        "CI binary -> "
        f"n={ci_binary_overall['n']}, "
        f"acc={ci_binary_overall['accuracy']:.3f}, "
        f"precision_yes={ci_binary_overall['precision_yes']:.3f}, "
        f"recall_yes={ci_binary_overall['recall_yes']:.3f}, "
        f"f1_yes={ci_binary_overall['f1_yes']:.3f}, "
        f"cm={ci_binary_overall['confusion_matrix']}"
    )
    print(
        "CI binary majority (ties excluded) -> "
        f"n={ci_binary_majority_overall['n']}, "
        f"ties_excluded={ties_excluded}, "
        f"acc={ci_binary_majority_overall['accuracy']:.3f}, "
        f"precision_yes={ci_binary_majority_overall['precision_yes']:.3f}, "
        f"recall_yes={ci_binary_majority_overall['recall_yes']:.3f}, "
        f"f1_yes={ci_binary_majority_overall['f1_yes']:.3f}, "
        f"cm={ci_binary_majority_overall['confusion_matrix']}"
    )
    print(
        "CI value check -> "
        f"llm_unique={llm_ci_unique_values}, "
        f"human_unique={human_ci_unique_values}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
