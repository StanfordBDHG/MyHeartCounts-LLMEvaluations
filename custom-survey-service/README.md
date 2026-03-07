<!--
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
SPDX-License-Identifier: MIT
-->

# Custom Survey Service

Next.js survey service for MyHeartCounts motivational nudge evaluation.

## What this implements

- Evaluator login via email + evaluator ID verification
- Alternate Stanford affiliate login for any `@stanford.edu` email with shared password, plus required first/last name capture
- Fixed session size of **4 nudges**
- Two fixed, mutually exclusive question bundles:
  - `bundle_a`: context inclusion + appropriateness
  - `bundle_b`: coherence + motivation + actionability
- Deterministic, quota-aware assignment:
  - balance bundle exposure over time
  - choose nudges with lowest global exposure first
  - deterministic tie breaks from evaluator/session seed
- Matrix survey UI with same nudge rows across all questions in a session
- Bulk response submission and CSV export endpoint
- Manual nudge import script for `nudge-generation` CSV outputs

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env.local` and fill values.
   - Set `STANFORD_AFFILIATE_PASSWORD` for Stanford affiliate login.
3. Apply SQL migrations in `supabase/migrations/`.
4. Seed at least one evaluator into the `evaluators` table before login works in a fresh environment:
   - Create a CSV (for example `supabase/seed_evaluators.csv`) with headers `email,evaluator_id,active` and at least one row.
   - Run `npm run import:evaluators -- supabase/seed_evaluators.csv` (executes `scripts/importEvaluators.ts`).
   - Alternative: run your own seed SQL file (for example `supabase/seed_evaluators.sql`) that inserts at least one row into `evaluators`.
5. Start dev server:
   - `npm run dev`

## Nudge import

Import a single generated CSV file:

- `npm run import:nudges -- ../nudge-generation/dist/nudge_permutations_results_gpt-5_sample_2.csv`

The script reads from either `llmResponse` (generation output) or `sampledNudgeJson` (single-sampled output), and supports these JSON formats:
- direct array of `{title, body}`
- wrapped object `{ "nudges": [{title, body}] }`
- single object `{ "title": "...", "body": "..." }`

It also stores prompt metadata from CSV columns in `nudges.metadata_json` (for example `gender`, `comorbidities`, and `preferred_notification_time`) so evaluator UI can show context for matching question types.

## Toggle question visibility

Use the `questions.active` boolean in Supabase Table Editor as the single on/off toggle.

- `active = true`: question can appear in evaluator sessions
- `active = false`: question is excluded at session creation time

Optional SQL to inspect active questions by bundle:

```sql
select
  qbi.bundle_id,
  q.stable_key,
  q.axis,
  q.active
from question_bundle_items qbi
join questions q on q.id = qbi.question_id
order by qbi.bundle_id, qbi.position_index;
```
