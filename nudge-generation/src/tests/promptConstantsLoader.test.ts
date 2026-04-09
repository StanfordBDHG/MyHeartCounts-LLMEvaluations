//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildPrompt,
  loadPromptConstants,
} from "../config/promptConstantsLoader.js";

const TEST_CONTEXT = {
  genderIdentity: "female",
  ageGroup: "35-50",
  disease: "Diabetes",
  stageOfChange: "Preparation",
  educationLevel: "college",
  language: "en",
  preferredNotificationTime: "7:00 AM",
};

const EXPECTED_PROMPT_SHA256 =
  "31f11a3dde9e5874927935e75ac5df49f36ecc8235deb3d6b662abfe85ee8944";

const run = () => {
  const constants = loadPromptConstants();
  assert.equal(constants.schemaVersion, "1.0.0");
  assert.ok(
    constants.templates.notificationTimeContext.includes(
      "{{preferredNotificationTime}}",
    ),
  );

  const prompt = buildPrompt(TEST_CONTEXT);
  const hash = createHash("sha256").update(prompt).digest("hex");
  assert.equal(hash, EXPECTED_PROMPT_SHA256);
  assert.equal(prompt.includes("{{"), false);
};

run();
console.log("promptConstantsLoader.test.ts passed");
