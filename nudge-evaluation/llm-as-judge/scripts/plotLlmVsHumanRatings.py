#!/usr/bin/env python3
#
# This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
#
# SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
#
# SPDX-License-Identifier: MIT
#
"""Plot overlap / disagreement between LLM-as-judge and preliminary human ratings.

Reads the pairwise rows produced by ``compareLlmJudgeToPrelimHuman.py``
(`analysis_temp/pairs.csv`) and renders four complementary figures:

1. ``rating_distribution_human_vs_llm.png`` — grouped bar chart of the rating
   distributions on Likert-scale axes (the overall "do they agree on
   magnitude?" view).
2. ``human_vs_llm_pair_heatmap.png`` — 7x7 heatmap of paired (Human, LLM) ratings
   on Likert-scale axes with the y = x identity line overlaid.
3. ``per_axis_signed_difference.png`` — diverging bar chart of mean signed
   difference (LLM mean − Human mean) per Likert-scale ``stable_key``, with MAE
   annotated. Context-inclusion (``ci_*``) axes are excluded because their
   scores are functionally binary and belong to the separate classification
   analysis.
4. ``yes_no_confusion_matrices.png`` — 2x2 confusion matrices for the yes/no
   (``ci_*``) axes, with an overall panel plus one per ``stable_key``. Uses the
   ``1 -> no``, ``7 -> yes`` mapping and treats human labels as ground truth.
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable, TypedDict

import matplotlib.pyplot as plt
import numpy as np


class PairRow(TypedDict):
    stable_key: str
    llm: float
    human: float


CI_KEYS = {"ci_age", "ci_comorbidity", "ci_gender", "ci_stage_change"}
RATING_RANGE = range(1, 8)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pairs-csv",
        type=Path,
        default=Path("nudge-evaluation/llm-as-judge/analysis_temp/pairs.csv"),
        help="Path to pairs.csv produced by compareLlmJudgeToPrelimHuman.py.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("nudge-evaluation/llm-as-judge/plots"),
        help="Directory for generated PNGs.",
    )
    parser.add_argument(
        "--filename-suffix",
        default="",
        help=(
            "Optional suffix to append to the base PNG filenames (e.g. "
            "'_uniform_responses_filtered_out') so existing plots are not "
            "overwritten when regenerating on a filtered pairs CSV."
        ),
    )
    return parser.parse_args()


def load_pairs(path: Path) -> list[PairRow]:
    rows: list[PairRow] = []
    with path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            rows.append(
                PairRow(
                    stable_key=row["stable_key"],
                    llm=float(row["llm_mean"]),
                    human=float(row["human_mean"]),
                )
            )
    return rows


def histogram_counts(values: Iterable[float]) -> list[int]:
    counter = Counter(int(round(v)) for v in values)
    return [counter.get(i, 0) for i in RATING_RANGE]


def plot_rating_distribution(rows: list[PairRow], out_path: Path) -> None:
    likert = [row for row in rows if row["stable_key"] not in CI_KEYS]
    human_counts = histogram_counts(row["human"] for row in likert)
    llm_counts = histogram_counts(row["llm"] for row in likert)
    total = len(likert)

    x = np.arange(len(RATING_RANGE))
    width = 0.38

    fig, ax = plt.subplots(figsize=(9, 5))
    bars_h = ax.bar(x - width / 2, human_counts, width, label="Human", color="#4C78A8")
    bars_l = ax.bar(x + width / 2, llm_counts, width, label="LLM-as-judge", color="#F58518")

    for bar_group, counts in ((bars_h, human_counts), (bars_l, llm_counts)):
        for bar, count in zip(bar_group, counts):
            if count == 0:
                continue
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.5,
                f"{count}\n({count / total:.0%})",
                ha="center",
                va="bottom",
                fontsize=8,
                color="#333",
            )

    ax.set_xticks(x)
    ax.set_xticklabels([str(v) for v in RATING_RANGE])
    ax.set_xlabel("Rating (1 = strongly disagree ... 7 = strongly agree)")
    ax.set_ylabel(f"Count (of N={total} comparable pairs)")
    ax.set_title("Likert-scale rating distribution: Human vs LLM-as-judge")
    ax.set_ylim(0, max(max(human_counts), max(llm_counts)) * 1.22)
    ax.grid(axis="y", linestyle=":", alpha=0.4)
    ax.legend(loc="upper left", frameon=False)

    fig.tight_layout()
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def plot_pair_heatmap(rows: list[PairRow], out_path: Path) -> None:
    likert = [row for row in rows if row["stable_key"] not in CI_KEYS]
    matrix = np.zeros((7, 7), dtype=int)
    for row in likert:
        human_idx = int(round(row["human"])) - 1
        llm_idx = int(round(row["llm"])) - 1
        if 0 <= human_idx < 7 and 0 <= llm_idx < 7:
            matrix[human_idx, llm_idx] += 1

    fig, ax = plt.subplots(figsize=(7.5, 6.5))
    im = ax.imshow(
        matrix,
        origin="lower",
        cmap="Blues",
        aspect="equal",
        extent=(0.5, 7.5, 0.5, 7.5),
    )

    for human_val in RATING_RANGE:
        for llm_val in RATING_RANGE:
            count = matrix[human_val - 1, llm_val - 1]
            if count == 0:
                continue
            ax.text(
                llm_val,
                human_val,
                str(count),
                ha="center",
                va="center",
                fontsize=10,
                color="white" if count >= matrix.max() * 0.55 else "#222",
            )

    ax.plot([0.5, 7.5], [0.5, 7.5], color="#E45756", linewidth=1.5, linestyle="--", label="y = x (perfect agreement)")
    ax.set_xticks(list(RATING_RANGE))
    ax.set_yticks(list(RATING_RANGE))
    ax.set_xlabel("LLM rating")
    ax.set_ylabel("Human rating")
    ax.set_title(f"Paired (Human, LLM) ratings on Likert-scale axes  (N={matrix.sum()})")
    ax.legend(loc="lower right", frameon=True, fontsize=9)
    cbar = fig.colorbar(im, ax=ax, shrink=0.82)
    cbar.set_label("Count of paired observations")

    fig.tight_layout()
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def plot_per_axis_signed_diff(rows: list[PairRow], out_path: Path) -> None:
    by_key: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for row in rows:
        if row["stable_key"] in CI_KEYS:
            continue
        by_key[row["stable_key"]].append((float(row["human"]), float(row["llm"])))

    records: list[tuple[str, float, float, int]] = []
    for key, pairs in by_key.items():
        human_vals = np.array([p[0] for p in pairs])
        llm_vals = np.array([p[1] for p in pairs])
        signed = float((llm_vals - human_vals).mean())
        mae = float(np.abs(llm_vals - human_vals).mean())
        records.append((key, signed, mae, len(pairs)))

    records.sort(key=lambda item: item[1])
    keys = [rec[0] for rec in records]
    signed = [rec[1] for rec in records]
    mae = [rec[2] for rec in records]

    fig, ax = plt.subplots(figsize=(9, 5.2))
    colors = ["#E45756" if diff < 0 else "#4C78A8" for diff in signed]
    y_positions = np.arange(len(keys))
    ax.barh(y_positions, signed, color=colors, edgecolor="#222", linewidth=0.4)
    ax.axvline(0, color="#222", linewidth=1)

    for y, diff, axis_mae in zip(y_positions, signed, mae):
        x_text = diff + (0.05 if diff >= 0 else -0.05)
        ha = "left" if diff >= 0 else "right"
        ax.text(
            x_text,
            y,
            f"MAE {axis_mae:.2f}",
            va="center",
            ha=ha,
            fontsize=8,
            color="#333",
        )

    ax.set_yticks(y_positions)
    ax.set_yticklabels(keys)
    ax.set_xlabel("Mean signed difference  (LLM − Human)  [points on 1–7 scale]")
    ax.set_title("Per-axis bias on Likert-scale axes: LLM vs Human")
    ax.grid(axis="x", linestyle=":", alpha=0.4)

    legend_handles = [
        plt.Rectangle((0, 0), 1, 1, color="#4C78A8", label="LLM higher than Human"),
        plt.Rectangle((0, 0), 1, 1, color="#E45756", label="LLM lower than Human"),
    ]
    ax.legend(handles=legend_handles, loc="lower right", frameon=False, fontsize=9)

    x_min = min(signed + [0]) - 0.6
    x_max = max(signed + [0]) + 0.6
    ax.set_xlim(x_min, x_max)

    fig.tight_layout()
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def _confusion_counts(pairs: list[tuple[int, int]]) -> np.ndarray:
    """Return 2x2 confusion matrix with rows=Human (no/yes), cols=LLM (no/yes).

    Input pairs are (human_label, llm_label) with 0=no, 1=yes.
    """
    matrix = np.zeros((2, 2), dtype=int)
    for human_label, llm_label in pairs:
        matrix[human_label, llm_label] += 1
    return matrix


def _binary_metrics(matrix: np.ndarray) -> dict[str, float | None]:
    tn, fp = int(matrix[0, 0]), int(matrix[0, 1])
    fn, tp = int(matrix[1, 0]), int(matrix[1, 1])
    total = tn + fp + fn + tp
    accuracy = (tp + tn) / total if total else None
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision and recall
        else None
    )
    return {"accuracy": accuracy, "precision": precision, "recall": recall, "f1": f1}


def _draw_confusion_panel(ax, matrix: np.ndarray, title: str) -> None:
    total = int(matrix.sum())
    im = ax.imshow(matrix, cmap="Blues", vmin=0, vmax=max(matrix.max(), 1))
    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(["no", "yes"])
    ax.set_yticklabels(["no", "yes"])
    ax.set_xlabel("LLM label")
    ax.set_ylabel("Human label")

    cell_labels = [["TN", "FP"], ["FN", "TP"]]
    threshold = matrix.max() * 0.55 if matrix.max() else 1
    for row in range(2):
        for col in range(2):
            count = int(matrix[row, col])
            percent = (count / total) if total else 0.0
            color = "white" if count >= threshold else "#222"
            ax.text(
                col,
                row,
                f"{cell_labels[row][col]}\n{count}\n({percent:.0%})",
                ha="center",
                va="center",
                fontsize=9,
                color=color,
            )

    metrics = _binary_metrics(matrix)
    def _fmt(value: float | None) -> str:
        return f"{value:.2f}" if value is not None else "—"

    subtitle = (
        f"N={total}  acc={_fmt(metrics['accuracy'])}  "
        f"P={_fmt(metrics['precision'])}  R={_fmt(metrics['recall'])}  "
        f"F1={_fmt(metrics['f1'])}"
    )
    ax.set_title(f"{title}\n{subtitle}", fontsize=10)
    for spine in ax.spines.values():
        spine.set_visible(False)


def plot_yes_no_confusion_matrices(
    rows: list[PairRow], out_path: Path
) -> None:
    """Render 2x2 confusion matrices for the yes/no (ci_*) axes.

    Left panel aggregates all ci_* pairs ("Overall"); the remaining panels show
    one matrix per ci_* ``stable_key``. Labels use the 1 -> no, 7 -> yes mapping
    and humans are treated as ground truth.
    """
    ci_rows = [row for row in rows if row["stable_key"] in CI_KEYS]
    if not ci_rows:
        return

    def encode(score: float) -> int | None:
        rounded = int(round(float(score)))
        if rounded == 1:
            return 0
        if rounded == 7:
            return 1
        return None

    by_key: dict[str, list[tuple[int, int]]] = defaultdict(list)
    overall_pairs: list[tuple[int, int]] = []
    for row in ci_rows:
        human_label = encode(row["human"])
        llm_label = encode(row["llm"])
        if human_label is None or llm_label is None:
            continue
        by_key[row["stable_key"]].append((human_label, llm_label))
        overall_pairs.append((human_label, llm_label))

    panel_keys = sorted(by_key.keys())
    n_panels = 1 + len(panel_keys)
    fig, axes = plt.subplots(1, n_panels, figsize=(3.2 * n_panels, 3.8))
    if n_panels == 1:
        axes = [axes]

    _draw_confusion_panel(axes[0], _confusion_counts(overall_pairs), "Overall (ci_*)")
    for ax, key in zip(axes[1:], panel_keys):
        _draw_confusion_panel(ax, _confusion_counts(by_key[key]), f"`{key}`")

    fig.suptitle(
        "Yes/No (context-inclusion) confusion matrices  —  rows: Human (ground truth), cols: LLM",
        fontsize=11,
    )
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(out_path, dpi=160)
    plt.close(fig)


def main() -> None:
    args = parse_args()
    rows = load_pairs(args.pairs_csv)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    suffix = args.filename_suffix or ""
    plot_rating_distribution(
        rows, args.output_dir / f"rating_distribution_human_vs_llm{suffix}.png"
    )
    plot_pair_heatmap(
        rows, args.output_dir / f"human_vs_llm_pair_heatmap{suffix}.png"
    )
    plot_per_axis_signed_diff(
        rows, args.output_dir / f"per_axis_signed_difference{suffix}.png"
    )
    plot_yes_no_confusion_matrices(
        rows, args.output_dir / f"yes_no_confusion_matrices{suffix}.png"
    )

    print(f"Wrote plots to {args.output_dir}/")


if __name__ == "__main__":
    main()
