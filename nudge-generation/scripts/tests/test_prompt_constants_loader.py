"""
This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project

SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
"""

from __future__ import annotations

import hashlib
import importlib.util
import unittest
from pathlib import Path

SCRIPTS_ROOT = Path(__file__).resolve().parents[1]
PROMPT_LOADER_PATH = SCRIPTS_ROOT / "lib" / "prompt_constants_loader.py"
_SPEC = importlib.util.spec_from_file_location(
    "nudge_prompt_constants_loader", PROMPT_LOADER_PATH
)
if _SPEC is None or _SPEC.loader is None:
    raise ImportError(f"Unable to load prompt constants loader at {PROMPT_LOADER_PATH}")
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
build_prompt = _MODULE.build_prompt
load_prompt_constants = _MODULE.load_prompt_constants

TEST_CONTEXT = {
    "genderIdentity": "female",
    "ageGroup": "35-50",
    "disease": "Diabetes",
    "stageOfChange": "Preparation",
    "educationLevel": "college",
    "language": "en",
    "preferredNotificationTime": "7:00 AM",
}

EXPECTED_PROMPT_SHA256 = "31f11a3dde9e5874927935e75ac5df49f36ecc8235deb3d6b662abfe85ee8944"


class PromptConstantsLoaderTests(unittest.TestCase):
    def test_loads_and_validates_schema(self) -> None:
        constants = load_prompt_constants()
        self.assertEqual(constants["schemaVersion"], "1.0.0")
        self.assertIn(
            "{{preferredNotificationTime}}",
            constants["templates"]["notificationTimeContext"],
        )

    def test_prompt_hash_regression(self) -> None:
        prompt = build_prompt(TEST_CONTEXT)
        digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        self.assertEqual(digest, EXPECTED_PROMPT_SHA256)
        self.assertNotIn("{{", prompt)


if __name__ == "__main__":
    unittest.main()
