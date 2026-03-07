<!-- 
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
SPDX-License-Identifier: MIT
-->

# Nudge Curation Runbook (v1)

## 1) Generate Curated Patient Contexts

Run this from `nudge-generation`:

The generator creates exactly 7 contexts using deterministic seeding. Disease curation is fixed to overrepresent disease cases: 2 disease-free contexts, plus 1 each for Heart failure, Pulmonary arterial hypertension, Diabetes, ACHD (simple), and ACHD (complex). All other fields are sampled uniformly at random (without null/blank values), including age group, gender, stage of change, education level, one activity type, and notification time.

```bash
python3 scripts/nudge-curation-v1/patient_context_curation_script_v1.py --seed 42 --pretty --output scripts/nudge-curation-v1/patient_contexts_seed42.json
```

## 2) Models Selected for Evaluation

- `gpt-5` (SecureGPT GPT-5)
- `mlx-community/Ministral-3-3B-Instruct-2512-4bit`
- `mlx-community/Qwen2.5-1.5B-Instruct-4bit`
- `mlx-community/Llama-3.2-1B-Instruct-4bit`
- `mlx-community/SmolLM3-3B-4bit`

## 3) Run Nudge Generation on the 7 Patient Contexts

Run this from `nudge-generation`:

```bash
npm run build && node dist/generateNudgePermutations.js --models "gpt-5,mlx-community/Ministral-3-3B-Instruct-2512-4bit,mlx-community/Qwen2.5-1.5B-Instruct-4bit,mlx-community/Llama-3.2-1B-Instruct-4bit,mlx-community/SmolLM3-3B-4bit" --contexts-json scripts/nudge-curation-v1/patient_contexts_seed42.json --output ../data/generated/nudge-curation-v1
```

### 3.1) Run Nudge Generation on MHC-Coach using TogetherAI
```bash
together endpoints hardware --model iamsriya/Meta-Llama-3-70B-Instruct-74d1928d  # check which hardware is available
together endpoints create \
--model iamsriya/Meta-Llama-3-70B-Instruct-74d1928d \
--hardware 4x_nvidia_h100_80gb_sxm \
--no-speculative-decoding \
--wait
together endpoints retrieve <ENDPOINT_ID>  # to get endpoint name
```

Then run inference using the Together Python API. Finally, stop/delete the TogetherAI endpoint:

```bash
together endpoints stop <ENDPOINT_ID>
together endpoints delete <ENDPOINT_ID>
```


## 4) Deterministically Sample One Nudge per Model Response

Run this from `nudge-generation`:

```bash
python3 scripts/nudge-curation-v1/sample_single_nudge_per_response_v1.py --input ../data/generated/nudge-curation-v1/nudge_permutations_results_multi-provider_6models_from-json.csv
```