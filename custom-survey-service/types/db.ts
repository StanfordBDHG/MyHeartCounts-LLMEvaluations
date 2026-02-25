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

export type QuestionRow = {
  id: string;
  axis: Axis;
  prompt_text: string;
  response_type: "likert_1_7" | "yes_no";
  scale_min: number | null;
  scale_max: number | null;
  active: boolean;
};

export type NudgeRow = {
  id: string;
  title: string;
  body: string;
  source_model: string | null;
  metadata_json: Record<string, unknown>;
  active: boolean;
};

export type EvaluatorRow = {
  id: string;
  email: string;
  evaluator_code_hash: string;
  active: boolean;
};
