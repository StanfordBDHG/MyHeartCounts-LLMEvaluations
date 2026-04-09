//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type NudgeInput, type SurveyQuestion } from "./types.js";

export const JUDGE_SCHEMA_NAME = "judge_scores";

export const JUDGE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["scores"],
  properties: {
    scores: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stable_key", "score_int", "confidence", "rationale"],
        properties: {
          stable_key: { type: "string" },
          score_int: { type: "integer", minimum: 1, maximum: 7 },
          confidence: {
            anyOf: [
              { type: "number", minimum: 0, maximum: 1 },
              { type: "null" },
            ],
          },
          rationale: { type: "string", minLength: 1 },
        },
      },
    },
  },
};

const stringifyContext = (
  context: Record<string, unknown> | undefined,
): string => {
  if (!context) {
    return "No structured patient context was provided.";
  }

  return JSON.stringify(context, null, 2);
};

const renderQuestionBlock = (question: SurveyQuestion): string => {
  const scoreRule =
    question.responseType === "yes_no"
      ? "Use score 1 for No and score 7 for Yes."
      : "Use the 1-7 rubric exactly as written.";
  const rubric =
    question.bodyMarkdown.trim().length > 0
      ? question.bodyMarkdown
      : "No additional rubric.";

  return [
    `stable_key: ${question.stableKey}`,
    `axis: ${question.axis}`,
    `response_type: ${question.responseType}`,
    `prompt_text: ${question.promptText}`,
    `score_mapping_rule: ${scoreRule}`,
    `rubric:`,
    rubric,
  ].join("\n");
};

export const buildJudgePrompt = (
  nudge: NudgeInput,
  questions: SurveyQuestion[],
): string => {
  const questionText = questions
    .map((question) => renderQuestionBlock(question))
    .join("\n\n---\n\n");

  return [
    "You are evaluating a motivational fitness nudge using the same survey questions used by human evaluators.",
    "Return only valid JSON matching the required schema.",
    "For each question listed, produce exactly one score object.",
    "",
    "Nudge:",
    `title: ${nudge.title}`,
    `body: ${nudge.body}`,
    "",
    "Patient Context:",
    stringifyContext(nudge.context),
    "",
    "Questions and rubrics:",
    questionText,
  ].join("\n");
};
