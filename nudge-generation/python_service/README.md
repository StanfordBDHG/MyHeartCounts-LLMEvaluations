<!-- 
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
SPDX-License-Identifier: MIT
-->

# Local Model Python Service

This service provides an HTTP API for running local models:
- MLX models (`mlx-community/*`) via `mlx-lm`
- Non-MLX Hugging Face models via `transformers` + `torch`

## Setup

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Notes:
   - MLX models require Apple Silicon (M1/M2/M3) Mac.
   - Non-MLX Hugging Face models will use GPU when available (`cuda` or `mps`) and CPU otherwise.

3. Models will be automatically downloaded from Hugging Face on first use

## Running the Service

Start the service:
```bash
python huggingface_service.py
```

Or using uvicorn directly:
```bash
uvicorn huggingface_service:app --reload
```

The service will run on `http://localhost:8000` by default.

## API Endpoints

### Health Check
```
GET /health
```

Returns service status.

### Generate Text
```
POST /generate
Content-Type: application/json

{
  "model_id": "mlx-community/Llama-3.2-1B-Instruct-4bit",
  "prompt": "Your prompt here",
  "max_tokens": 512,
  "temperature": 0.7
}
```

**Response:**
```json
{
  "response": "Generated text...",
  "model_id": "mlx-community/Llama-3.2-1B-Instruct-4bit",
  "latency_ms": 1234.56,
  "error": null
}
```

## Supported Models

- All models from the `mlx-community` organization on Hugging Face are supported (MLX path).
- Additional non-MLX Hugging Face models are supported through `transformers` (for example, `SriyaM/MHC-Coach`).

Special handling is implemented for:
- `mlx-community/SmolLM3-3B-4bit` - requires system message with "/no_think" content

## Notes

- Models are loaded on-demand for each request (not cached in memory)
- First request for each model may be slower as the model needs to be downloaded/loaded
- The service uses chat templates automatically when supported by the tokenizer

