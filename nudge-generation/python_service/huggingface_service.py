"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

from typing import Any, Optional
from fastapi import FastAPI
from pydantic import BaseModel
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

app = FastAPI()


# Request/Response models
class GenerateRequest(BaseModel):
    model_id: str
    prompt: str
    max_tokens: int = 512
    temperature: Optional[float] = None


class GenerateResponse(BaseModel):
    response: str
    model_id: str
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    message: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        message="Local model service is running (MLX + Transformers)",
    )


def _resolve_torch_device() -> str:
    """Pick the best available accelerator, then fall back to CPU."""
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _build_transformers_prompt(tokenizer: Any, prompt: str, device: str):
    """Apply chat template when available, otherwise use raw prompt tokenization."""
    if hasattr(tokenizer, "apply_chat_template"):
        messages = [{"role": "user", "content": prompt}]
        tokenized = tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, return_tensors="pt"
        )
    else:
        tokenized = tokenizer(prompt, return_tensors="pt")

    if isinstance(tokenized, dict):
        moved = {key: value.to(device) for key, value in tokenized.items()}
        prompt_tokens = moved["input_ids"].shape[-1]
        return moved, prompt_tokens

    moved = tokenized.to(device)
    prompt_tokens = moved.shape[-1]
    return {"input_ids": moved}, prompt_tokens


def _generate_transformers_text(request: GenerateRequest) -> str:
    model_name = request.model_id
    device = _resolve_torch_device()
    dtype = torch.float16 if device in {"cuda", "mps"} else torch.float32

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer is None:
        raise RuntimeError(f"Failed to load tokenizer for model: {model_name}")

    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        dtype=dtype,
    )
    model.to(device)
    model.eval()

    inputs, prompt_tokens = _build_transformers_prompt(tokenizer, request.prompt, device)

    temperature = request.temperature
    do_sample = temperature is not None and temperature > 0
    eos_token_id = tokenizer.eos_token_id
    pad_token_id = tokenizer.pad_token_id
    resolved_pad_token_id = (
        eos_token_id if eos_token_id is not None
        else pad_token_id if pad_token_id is not None
        else 0
    )

    generation_kwargs: dict[str, Any] = {
        "max_new_tokens": request.max_tokens,
        "do_sample": do_sample,
        "pad_token_id": resolved_pad_token_id,
    }
    if do_sample:
        # do_sample ensures temperature is non-None and positive.
        generation_kwargs["temperature"] = float(temperature)

    with torch.no_grad():
        output_ids = model.generate(**inputs, **generation_kwargs)

    completion_ids = output_ids[0][prompt_tokens:]
    decoded = tokenizer.decode(completion_ids, skip_special_tokens=True)
    completion = (
        "".join(decoded).strip()
        if isinstance(decoded, list)
        else str(decoded).strip()
    )
    return completion


@app.post("/generate", response_model=GenerateResponse)
async def generate_text(request: GenerateRequest):
    """
    Generate text using local models.
    - MLX models (mlx-community/*) use mlx-lm
    - Other Hugging Face models use transformers + torch
    """
    try:
        model_name = request.model_id
        if model_name.startswith("mlx-community/"):
            from mlx_lm import load, generate
            model, tokenizer, *_ = load(model_name)

            # Format prompt with chat template
            context = [{"role": "user", "content": request.prompt}]

            if model_name == "mlx-community/SmolLM3-3B-4bit":
                context.insert(0, {"role": "system", "content": "/no_think"})

            formatted_prompt = tokenizer.apply_chat_template(
                context, add_generation_prompt=True
            )

            # Note: mlx_lm.generate() does NOT accept temperature/temp parameters
            # See: https://github.com/ml-explore/mlx-lm/issues/281
            generate_kwargs = {
                "prompt": formatted_prompt,
                "max_tokens": request.max_tokens,
            }

            text = generate(model, tokenizer, **generate_kwargs)
        else:
            text = _generate_transformers_text(request)

        return GenerateResponse(
            response=text,
            model_id=model_name,
        )

    except Exception as e:
        error_message = str(e)

        return GenerateResponse(
            response="",
            model_id=request.model_id,
            error=error_message,
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
