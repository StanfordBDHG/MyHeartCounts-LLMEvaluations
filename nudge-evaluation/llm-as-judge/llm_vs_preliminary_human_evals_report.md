<!-- 
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
SPDX-License-Identifier: MIT
-->

# LLM-as-Judge vs Preliminary Human Evaluation Comparison

## Scope

- LLM outputs: `data/evaluated/llm_as_judge_outputs_all49` (CSV files for 49 unique LLM nudge IDs, 15 stable keys)
- Human evaluations: `data/backups/supabase/20260402T221023Z/public/tables` (`responses.csv`, `questions.csv`, `nudges.csv`)
- Join strategy:
  - Join `responses.question_id -> questions.id` to get `stable_key`
  - Join `responses.nudge_id -> nudges.id` to get nudge text
  - Map LLM nudge IDs to Supabase nudge IDs using exact `nudge_body` match (fallback to exact title match)

## Coverage and Matching

- LLM rows analyzed: **735**
- Human response rows analyzed: **180**
- Stable keys in both sources: **15**
- LLM nudge IDs mapped to Supabase nudges: **49 / 49** (no ambiguous or missing mappings)
- Comparable score pairs (`nudge`, `stable_key`): **180** total (**132 non-CI**, **48 CI**)
- Unique Supabase nudges included in pairwise comparison: **24**

## Overall Agreement

Top-level agreement/error metrics are computed on **non-CI pairs only** (CI is handled separately as binary):

- Non-CI pair count: **132** (`24` nudges x `11` non-CI keys)
- Pearson correlation: **0.214**
- Spearman correlation: **0.267**
- Mean absolute error (MAE): **1.00** points (on 1-7 scale)
- RMSE: **1.44**
- Mean signed difference (LLM - Human): **-0.045** points
  - Interpretation: on non-CI axes, LLM is close to unbiased on average and about 1 point off in absolute terms.

Reference (including CI in numeric scoring): Pearson **0.554**, Spearman **0.420**, MAE **1.20**, RMSE **2.08**.

Pairwise difference distribution:

- Exact match: **43 / 132** (32.6%)
- LLM lower than human: **58 / 132** (43.9%)
- LLM higher than human: **31 / 132** (23.5%)
- Absolute difference buckets:
  - `<= 0.5`: **43**
  - `0.5 to 1`: **65**
  - `1 to 2`: **13**
  - `> 2`: **11**

## Non-CI Rating Distributions (Human vs LLM)

Scope: comparable mapped non-CI rows only (`n=132` for each source).

Summary statistics:

| Source | n | Mean | Median | Std Dev | Min | Max | Range |
|---|---:|---:|---:|---:|---:|---:|---:|
| Human ratings | 132 | 5.59 | 6.00 | 1.36 | 2 | 7 | 5 |
| LLM ratings | 132 | 5.55 | 6.00 | 0.85 | 3 | 7 | 4 |

Histogram (counts by score 1-7):

| Source | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Human ratings | 0 | 5 | 7 | 16 | 20 | 45 | 39 |
| LLM ratings | 0 | 0 | 7 | 3 | 40 | 75 | 7 |

Histogram (percent by score 1-7):

| Source | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Human ratings | 0.0% | 3.8% | 5.3% | 12.1% | 15.2% | 34.1% | 29.5% |
| LLM ratings | 0.0% | 0.0% | 5.3% | 2.3% | 30.3% | 56.8% | 5.3% |

Interpretation:

- Both distributions center around score 6 (median 6.0).
- LLM ratings are more concentrated (lower std dev), especially at score 6.
- Humans use more of the upper range (more 7s) and also a broader spread down to 2.

## Context Inclusion as Binary Classification (`ci_*`)

For `ci_*` stable keys, scores were converted as:

- `1 -> no`
- `7 -> yes`

Value integrity check (both datasets):

- LLM `ci_*` unique values: **[1, 7]**
- Human `ci_*` unique values: **[1, 7]**
- Confirmation: **no non-1/7 values are present** for context inclusion in either source.

Rater-level binary metrics (`yes` as positive class), using human preliminary labels as ground truth:

- Samples: **48** rater labels
- Confusion matrix: **TP=4, FP=0, TN=30, FN=14**
- Accuracy: **0.708**
- Precision (`yes`): **1.000**
- Recall (`yes`): **0.222**
- F1 (`yes`): **0.364**
- Specificity (`no`): **1.000**
- Balanced accuracy: **0.611**

Per-`ci_*` accuracy:

- `ci_comorbidity`: **0.917** (best)
- `ci_gender`: **0.833**
- `ci_age`: **0.667**
- `ci_stage_change`: **0.417** (worst)

Majority-vote metrics (pair-level vote by `nudge x ci_*`, ties excluded):

- Ties excluded: **0**
- Samples after tie exclusion: **48**
- Confusion matrix: **TP=4, FP=0, TN=30, FN=14**
- Accuracy: **0.708**
- Precision (`yes`): **1.000**
- Recall (`yes`): **0.222**
- F1 (`yes`): **0.364**

## Largest Axis-Level Disagreements (Non-CI, by MAE)

| stable_key | n_pairs | LLM avg | Human avg | MAE | Direction |
|---|---:|---:|---:|---:|---|
| `ap_gender` | 12 | 6.17 | 4.33 | 2.33 | LLM much higher |
| `ap_age` | 12 | 6.00 | 6.17 | 1.33 | close (LLM slightly lower) |
| `ap_stage_change` | 12 | 4.42 | 5.25 | 1.33 | LLM lower |
| `act_actionable` | 12 | 5.75 | 5.92 | 1.00 | close (LLM slightly lower) |
| `ap_general` | 12 | 5.58 | 6.08 | 1.00 | LLM lower |

Best-aligned non-CI axes (lowest MAE):

- `coh_naturalness` (MAE **0.58**)
- `coh_logic` (MAE **0.58**)
- `mot_friendly` (MAE **0.58**)
- `mot_empowering` (MAE **0.67**)
- `mot_motivating` (MAE **0.75**)

## Nudge-Level Disagreement Hotspots (Non-CI Axes)

Highest MAE nudges:

- `Stay Fit, Stay Ahead` (MAE **2.00**)
- `Health Boost` (MAE **1.80**)
- `Step Up Your Routine` (MAE **1.80**)
- `Keep Your Streak` (MAE **1.67**)
- `Stay Active` (MAE **1.60**)

Lowest MAE nudges:

- `Lower-Impact Sports for Quality of Life` (MAE **0.17**)
- `Walk after dinner` (MAE **0.33**)
- `Take a Short Walk Today` (MAE **0.40**)
- `Wednesday Workout` (MAE **0.50**)
- `Morning Walk` (MAE **0.50**)

## Key Takeaways

- On non-CI axes, agreement is **weak-to-moderate** (Pearson 0.21 / Spearman 0.27).
- The largest systematic gap is in **context inclusion for stage-of-change** (`ci_stage_change`), where LLM is much stricter/lower.
- LLM tends to be **more generous** than humans for `ap_gender` but **more conservative** on multiple context-inclusion axes.
- For non-CI axes, most pairs are within 1 point (**108/132**), with fewer large disagreements (**11** pairs >2 points).

## Notes / Limitations

- Human labels are marked as **preliminary** and come from a limited set of evaluated nudges in the Supabase backup.
- The report uses exact text-based nudge mapping; this worked cleanly for this dataset (no ambiguous mappings).
- Top-level correlations/errors are based on averaged human responses per (`nudge`, `stable_key`) and averaged LLM scores per mapped pair, excluding `ci_*` keys.

