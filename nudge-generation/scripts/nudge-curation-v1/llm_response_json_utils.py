"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

from __future__ import annotations

import json
import re
from typing import Any


def parse_llm_response_as_json_array(raw_response: str) -> list[Any]:
    text = (raw_response or "").strip()
    if not text:
        raise ValueError("llmResponse is empty.")

    parse_candidates: list[str] = [text]

    fenced_json_match = re.search(r"```json\s*(.*?)\s*```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced_json_match:
        parse_candidates.append(fenced_json_match.group(1).strip())

    fenced_any_match = re.search(r"```\s*(.*?)\s*```", text, flags=re.DOTALL)
    if fenced_any_match:
        parse_candidates.append(fenced_any_match.group(1).strip())

    bracket_start = text.find("[")
    bracket_end = text.rfind("]")
    if bracket_start != -1 and bracket_end != -1 and bracket_end > bracket_start:
        parse_candidates.append(text[bracket_start : bracket_end + 1].strip())

    parse_errors: list[str] = []
    for candidate in parse_candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list):
                return parsed
            parse_errors.append("Parsed JSON is not a list.")
        except json.JSONDecodeError as error:
            parse_errors.append(str(error))

    details = "; ".join(parse_errors) if parse_errors else "Unknown parsing failure."
    raise ValueError(f"Unable to parse llmResponse as JSON array. Details: {details}")
