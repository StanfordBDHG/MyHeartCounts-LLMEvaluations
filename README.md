<!-- 
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project
SPDX-FileCopyrightText: 2025 Stanford University and the project authors (see CONTRIBUTORS.md)
SPDX-License-Identifier: MIT
-->

# MyHeart Counts LLM Evaluations

This repository contains tools for generating and evaluating personalized health nudges using various large language models (LLMs). The project is organized into two main modules: **nudge-generation** for creating nudge permutations across different personalization contexts, and **nudge-evaluation** for analyzing the generated nudges using linguistic and statistical methods.

## Overview

This project enables systematic testing and evaluation of LLM-generated health nudges across:
- **Multiple LLM providers**: OpenAI, SecureGPT (GPT-5, Gemini 2.5 Pro), and local MLX models
- **Personalization contexts**: Gender, age, disease conditions, stage of change, education level, language, workout preferences, and notification timing
- **Evaluation metrics**: Linguistic features (sentiment, readability, action verbs, temporal references, etc.)

## Project Structure

```
MyHeartCounts-LLMEvaluations/
├── data/
│   ├── generated/          # CSV files from nudge generation
│   └── evaluated/          # Analysis outputs from evaluation tools
├── nudge-generation/       # Generation module (TypeScript/Node.js)
│   ├── generateNudgePermutations.ts
│   ├── backends/           # LLM backend implementations
│   ├── config/             # Model configurations
│   └── python_service/     # MLX model service
└── nudge-evaluation/       # Evaluation module (Python)
    ├── analyzeNudgeLinguistics.py
    └── requirements.txt
```

## Quick Start

### 1. Generate Nudges

```bash
cd nudge-generation
npm install
npm run build

# Set API keys (if using OpenAI or SecureGPT)
export OPENAI_API_KEY="your-key"
export SECUREGPT_API_KEY="your-key"

# Generate sample nudges
npm run build && node dist/generateNudgePermutations.js --sample 10
```

Results are saved to `data/generated/nudge_permutations_results_*.csv`

### 2. Evaluate Nudges

```bash
cd nudge-evaluation
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# Analyze generated nudges
python analyzeNudgeLinguistics.py ../data/generated/nudge_permutations_results_*.csv --summary
```

Results are saved to `data/evaluated/*_with_linguistics.csv`

## Modules

### nudge-generation

Generates all possible permutations of personalization contexts and captures LLM responses for analysis. Supports multiple model backends including OpenAI API, SecureGPT, and local MLX models.

**Key Features:**
- Tests 13,824+ context permutations
- Supports multiple LLM providers
- Configurable sampling and randomization
- Outputs structured CSV files

**See [nudge-generation/README.md](nudge-generation/README.md) for detailed documentation.**

### nudge-evaluation

Performs automated linguistic and statistical analyses on generated nudges. Extracts individual nudges from JSON responses and computes comprehensive linguistic features.

**Key Features:**
- Linguistic feature extraction (word count, sentiment, readability, etc.)
- Action verb and temporal reference detection
- Lexical diversity analysis
- Summary statistics by model

**See [nudge-evaluation/README.md](nudge-evaluation/README.md) for detailed documentation.**

## Setup

### Prerequisites

- **Node.js** (v18+) and npm - for nudge generation
- **Python** (3.8+) and pip - for nudge evaluation
- **Apple Silicon Mac** (M1/M2/M3) - for MLX models (optional)

### Installation

#### Generation Module

```bash
cd nudge-generation
npm install
```

For MLX models, also install Python dependencies and start the service:
```bash
# Install dependencies
cd nudge-generation
pip install -r requirements.txt

# Start the MLX service (runs on http://localhost:8000 by default)
npm run start:python-service
# Or manually: cd python_service && python mlx_service.py
```

#### Evaluation Module

```bash
cd nudge-evaluation
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### API Keys

**OpenAI Models:**
```bash
export OPENAI_API_KEY="your-api-key-here"
```

**SecureGPT Models:**
```bash
export SECUREGPT_API_KEY="your-securegpt-api-key-here"
```

## Workflow

### Complete Example

1. **Generate nudges with multiple models:**
   ```bash
   cd nudge-generation
   npm run build
   node dist/generateNudgePermutations.js --provider all --sample 50
   ```

2. **Analyze the results:**
   ```bash
   cd ../nudge-evaluation
   python analyzeNudgeLinguistics.py ../data/generated/nudge_permutations_results_*.csv --summary
   ```

3. **Review outputs:**
   - Generated CSV: `data/generated/nudge_permutations_results_*.csv`
   - Analysis CSV: `data/evaluated/*_with_linguistics.csv`
   - Summary CSV: `data/evaluated/summary_linguistics_by_model.csv`

## Available Models

### OpenAI
- `gpt-5.2-2025-12-11` - GPT-5.2

### SecureGPT
- `gpt-5`, `gpt-5-mini`, `gpt-5-nano` - SecureGPT GPT-5 variants
- `gemini-2.5-pro` - SecureGPT Gemini 2.5 Pro

### MLX (15 models available)
Local models running on Apple Silicon, including:
- Llama-3.2 variants (1B, 3B)
- Phi-4-mini
- Gemma-3 variants
- Qwen2.5 variants
- SmolLM variants
- And more...

**Note:** MLX models require Apple Silicon (M1/M2/M3) Mac. Models are automatically downloaded from Hugging Face on first use and loaded on-demand (not cached). The first request for each model may be slower as the model needs to be downloaded and loaded.

See [nudge-generation/README.md](nudge-generation/README.md) for the complete list.

## Data Directory

The `data/` directory is shared between modules:

- **`data/generated/`** - CSV files from nudge generation containing:
  - Context variables (gender, age, disease, etc.)
  - Full prompts and LLM responses
  - Latency and error information

- **`data/evaluated/`** - Analysis outputs containing:
  - Expanded nudge data (one row per nudge)
  - Linguistic features for titles and bodies
  - Summary statistics by model

## Context Variables

The generation module tests all combinations of:

- **genderIdentity**: 'male', 'female'
- **ageGroup**: '<35', '35-50', '51-65', '>65'
- **disease**: null, 'Heart failure', 'Pulmonary arterial hypertension', 'Diabetes', 'ACHD (simple)', 'ACHD (complex)'
- **stateOfChange**: null, 'Precontemplation', 'Contemplation', 'Preparation', 'Action', 'Maintenance'
- **educationLevel**: 'Highschool', 'college', 'collage'
- **language**: 'en', 'es'
- **preferredWorkoutTypes**: Various combinations
- **preferredNotificationTime**: '7:00 AM', '12:00 PM', '6:00 PM'

**Total permutations: 13,824 combinations**

## Evaluation Features

The evaluation module computes the following linguistic features:

### Body Features (7):
- Word count, sentiment, action-verb frequency, temporal reference, lexical diversity (TTR), exclamation usage, readability

### Title Features (6):
- Word count, sentiment, action-verb frequency, temporal reference, exclamation usage, readability

See [nudge-evaluation/README.md](nudge-evaluation/README.md) for detailed feature descriptions.

## Troubleshooting

### Generation Issues

- **Python service not available**: Ensure MLX service is running (`npm run start:python-service` in nudge-generation). The service runs on `http://localhost:8000` by default.
- **API key errors**: Verify environment variables are set correctly
- **Model loading errors**: Check model availability and system requirements (MLX requires Apple Silicon)
- **Slow first request**: MLX models are loaded on-demand; the first request for each model may be slower as it needs to be downloaded/loaded

### Evaluation Issues

- **spaCy model not found**: Run `python -m spacy download en_core_web_sm`
- **Import errors**: Ensure all dependencies are installed (`pip install -r requirements.txt`)
- **File not found**: Check that CSV files exist in `data/generated/`

For detailed troubleshooting, see the module-specific READMEs.

## Contributing

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for information about contributing to this project.

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

