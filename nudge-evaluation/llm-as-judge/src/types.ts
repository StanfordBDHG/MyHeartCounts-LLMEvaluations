//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

export type Axis =
  | "context_inclusion"
  | "appropriateness"
  | "coherence"
  | "motivation"
  | "actionability";

export type ResponseType = "likert_1_7" | "yes_no";

export type JudgeStrategy = "single" | "axis-batched-grouped" | "two-stage";

export interface SurveyQuestion {
  stableKey: string;
  axis: Axis;
  promptText: string;
  bodyMarkdown: string;
  responseType: ResponseType;
  scaleMin: number | null;
  scaleMax: number | null;
  active: boolean;
  ordinal: number;
}

export interface NudgeInput {
  nudgeId: string;
  title: string;
  body: string;
  context?: Record<string, unknown>;
}

export interface QuestionScore {
  stable_key: string;
  score_int: number;
  confidence: number | null;
  rationale: string;
}

export interface QuestionEvaluation extends QuestionScore {
  axis: Axis;
  response_type: ResponseType;
  prompt_text: string;
}

export interface JudgeRunOutput {
  run: {
    strategy: JudgeStrategy;
    modelId: string;
    provider: "openai" | "securegpt";
    createdAt: string;
    promptVersion: string;
  };
  nudge: NudgeInput;
  questions: SurveyQuestion[];
  evaluations: QuestionEvaluation[];
  rawResponses: Record<string, string>;
}
