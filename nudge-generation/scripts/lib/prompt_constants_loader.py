"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PROMPT_SNIPPET_CATEGORIES = (
    "genderIdentity",
    "ageGroup",
    "disease",
    "stageOfChange",
    "educationLevel",
    "language",
)


def _default_prompt_constants_path() -> Path:
    return Path(__file__).resolve().parents[2] / "config/prompts/prompt_constants.v1.json"


def _default_prompt_schema_path() -> Path:
    return Path(__file__).resolve().parents[2] / "config/prompts/prompt_constants.schema.json"


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    return value


def _require_string_map(value: Any, field: str) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    output: dict[str, str] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise ValueError(f"{field} contains a non-string key")
        if not isinstance(item, str):
            raise ValueError(f"{field}.{key} must be a string")
        output[key] = item
    return output


def validate_prompt_constants(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Prompt constants must be a JSON object")

    _require_string(payload.get("schemaVersion"), "schemaVersion")
    base_instruction = _require_string(
        payload.get("baseNudgeInstruction"), "baseNudgeInstruction"
    )
    if not base_instruction.strip():
        raise ValueError("baseNudgeInstruction must be non-empty")

    templates = payload.get("templates")
    if not isinstance(templates, dict):
        raise ValueError("templates must be an object")

    notification_template = _require_string(
        templates.get("notificationTimeContext"),
        "templates.notificationTimeContext",
    )
    if "{{preferredNotificationTime}}" not in notification_template:
        raise ValueError(
            "templates.notificationTimeContext must include {{preferredNotificationTime}}"
        )
    _require_string(templates.get("fullPromptAssembly"), "templates.fullPromptAssembly")

    context_snippets = payload.get("contextSnippets")
    if not isinstance(context_snippets, dict):
        raise ValueError("contextSnippets must be an object")

    defaults = payload.get("defaults")
    if not isinstance(defaults, dict):
        raise ValueError("defaults must be an object")

    for category in PROMPT_SNIPPET_CATEGORIES:
        _require_string_map(
            context_snippets.get(category), f"contextSnippets.{category}"
        )
        _require_string(defaults.get(category), f"defaults.{category}")

    return payload


def load_prompt_constants(path: str | Path | None = None) -> dict[str, Any]:
    constants_path = Path(path).resolve() if path else _default_prompt_constants_path()
    payload = json.loads(constants_path.read_text(encoding="utf-8"))
    validated = validate_prompt_constants(payload)

    # Parse schema file so failures surface early if the contract file is missing/invalid JSON.
    schema_path = _default_prompt_schema_path()
    if not schema_path.exists():
        raise ValueError(f"Prompt constants schema file not found: {schema_path}")
    json.loads(schema_path.read_text(encoding="utf-8"))
    return validated


def render_template(template: str, values: dict[str, str]) -> str:
    output = template
    for key, value in values.items():
        output = output.replace(f"{{{{{key}}}}}", value)
    return output


def get_context_snippet(
    constants: dict[str, Any], category: str, value: str | None
) -> str:
    if category not in PROMPT_SNIPPET_CATEGORIES:
        raise ValueError(f"Unsupported context snippet category: {category}")

    defaults = constants["defaults"]
    if not value:
        return defaults[category]

    snippets = constants["contextSnippets"][category]
    return snippets.get(value, defaults[category])


def build_prompt(context: dict[str, Any], path: str | Path | None = None) -> str:
    constants = load_prompt_constants(path)
    language_context = get_context_snippet(constants, "language", context["language"])
    gender_context = get_context_snippet(
        constants, "genderIdentity", context["genderIdentity"]
    )
    age_context = get_context_snippet(constants, "ageGroup", context["ageGroup"])
    disease_context = get_context_snippet(constants, "disease", context.get("disease"))
    stage_context = get_context_snippet(
        constants, "stageOfChange", context.get("stageOfChange")
    )
    education_context = get_context_snippet(
        constants, "educationLevel", context["educationLevel"]
    )
    notification_time_context = render_template(
        constants["templates"]["notificationTimeContext"],
        {"preferredNotificationTime": context["preferredNotificationTime"]},
    )

    return render_template(
        constants["templates"]["fullPromptAssembly"],
        {
            "baseNudgeInstruction": constants["baseNudgeInstruction"],
            "languageContext": language_context,
            "genderContext": gender_context,
            "ageContext": age_context,
            "diseaseContext": disease_context,
            "stageContext": stage_context,
            "educationContext": education_context,
            "notificationTimeContext": notification_time_context,
        },
    )
