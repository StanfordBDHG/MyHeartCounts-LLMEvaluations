<!-- 
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
SPDX-License-Identifier: MIT
-->

# LLM-As-Judge

TypeScript pipeline that evaluates a nudge with the same custom-survey-service questions used for human evaluation.

## What It Does

- Loads canonical questions from `custom-survey-service/supabase/migrations/20260223_init.sql`
- Includes each question's `body_markdown` rubric text in prompt construction
- Reuses `nudge-generation` model configs/backends for OpenAI and SecureGPT
- Supports:
  - `single` strategy (all questions in one call)
  - `axis-batched-grouped` strategy (3 calls):
    - `context_inclusion + appropriateness`
    - `coherence`
    - `motivation + actionability`
  - `two-stage` strategy scaffold:
    - stage 1: grouped-axis draft scoring
    - stage 2: calibration pass over all questions using stage 1 draft outputs
- Emits:
  - canonical JSON
  - flat CSV for Python workflows

## Setup

```bash
npm --prefix nudge-evaluation/llm-as-judge install
```

## Usage

```bash
npm --prefix nudge-evaluation/llm-as-judge run judge -- \
  --model-id gpt-5.2-2025-12-11 \
  --strategy axis-batched-grouped \
  --title "Small step today" \
  --body "Try a brisk 10-minute walk after lunch." \
  --context-json '{"ageGroup":"65-74","stageOfChange":"Preparation"}'
```

Or with an input file:

```bash
npm --prefix nudge-evaluation/llm-as-judge run judge -- \
  --input ./nudge.json \
  --model-id gpt-5
```

Input file shape:

```json
{
  "nudgeId": "example-nudge-1",
  "title": "Small step today",
  "body": "Try a brisk 10-minute walk after lunch.",
  "context": {
    "ageGroup": "65-74",
    "stageOfChange": "Preparation"
  }
}
```

## Required Environment Variables

- OpenAI models: `OPENAI_API_KEY`
- SecureGPT models: `SECUREGPT_API_KEY`

## Batch Run (CSV -> many nudges)

Evaluate the sampled nudge CSV with SecureGPT GPT-5:

```bash
npm --prefix nudge-evaluation/llm-as-judge run judge:batch -- \
  --csv-input data/generated/nudge-curation-v1/nudge_permutations_results_multi-provider_7models_from-json_sampled-single-nudge.csv \
  --max-nudges 49 \
  --model-id gpt-5 \
  --strategy axis-batched-grouped
```

Helpful flags:

- `--skip-existing` to resume without re-running completed rows
- `--fail-fast` to stop on first failed row

