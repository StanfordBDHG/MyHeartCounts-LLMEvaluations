//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type JudgeModelClient } from "./modelClient.js";
import {
  buildJudgePrompt,
  JUDGE_JSON_SCHEMA,
  JUDGE_SCHEMA_NAME,
} from "./prompts.js";
import {
  type Axis,
  type NudgeInput,
  type QuestionEvaluation,
  type QuestionScore,
  type SurveyQuestion,
} from "./types.js";

const GROUPED_AXES: Array<{ id: string; axes: Axis[] }> = [
  {
    id: "context_and_appropriateness",
    axes: ["context_inclusion", "appropriateness"],
  },
  {
    id: "coherence",
    axes: ["coherence"],
  },
  {
    id: "motivation_and_actionability",
    axes: ["motivation", "actionability"],
  },
];

const ensureIntegerScore = (score: QuestionScore): QuestionScore => {
  if (
    !Number.isInteger(score.score_int) ||
    score.score_int < 1 ||
    score.score_int > 7
  ) {
    throw new Error(
      `Invalid score for ${score.stable_key}: ${score.score_int}`,
    );
  }
  if (
    score.confidence !== null &&
    (typeof score.confidence !== "number" ||
      score.confidence < 0 ||
      score.confidence > 1)
  ) {
    throw new Error(
      `Invalid confidence for ${score.stable_key}: ${String(score.confidence)}`,
    );
  }
  return score;
};

const parseScores = (payload: unknown): QuestionScore[] => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("scores" in payload)
  ) {
    throw new Error("Model response missing scores array");
  }
  const scores = (payload as { scores: unknown }).scores;
  if (!Array.isArray(scores)) {
    throw new Error("Model response scores is not an array");
  }

  return scores.map((score) => {
    if (typeof score !== "object" || score === null) {
      throw new Error("Score entry is not an object");
    }
    const row = score as Record<string, unknown>;
    if (typeof row.stable_key !== "string") {
      throw new Error("Score entry stable_key must be a string");
    }
    if (typeof row.rationale !== "string") {
      throw new Error("Score entry rationale must be a string");
    }
    return ensureIntegerScore({
      stable_key: row.stable_key,
      score_int: Number(row.score_int),
      confidence:
        row.confidence === null || row.confidence === undefined
          ? null
          : Number(row.confidence),
      rationale: row.rationale,
    });
  });
};

const mergeScoresWithQuestions = (
  questions: SurveyQuestion[],
  scores: QuestionScore[],
): QuestionEvaluation[] => {
  const questionStableKeys = new Set(
    questions.map((question) => question.stableKey),
  );
  const scoreByStableKey = scores.reduce<Map<string, QuestionScore>>(
    (accumulator, score) => {
      if (accumulator.has(score.stable_key)) {
        throw new Error(`Duplicate stable_key in scores: ${score.stable_key}`);
      }
      if (!questionStableKeys.has(score.stable_key)) {
        throw new Error(
          `Unexpected stable_key in scores: ${score.stable_key}`,
        );
      }
      accumulator.set(score.stable_key, score);
      return accumulator;
    },
    new Map<string, QuestionScore>(),
  );
  return questions.map((question) => {
    const score = scoreByStableKey.get(question.stableKey);
    if (!score) {
      throw new Error(`Missing score for question ${question.stableKey}`);
    }
    return {
      ...score,
      axis: question.axis,
      response_type: question.responseType,
      prompt_text: question.promptText,
    };
  });
};

const buildTwoStageCalibrationPrompt = (
  nudge: NudgeInput,
  questions: SurveyQuestion[],
  draftEvaluations: QuestionEvaluation[],
): string => {
  const questionByStableKey = new Map(
    questions.map((question) => [question.stableKey, question]),
  );

  const draftText = draftEvaluations
    .map((evaluation) => {
      const question = questionByStableKey.get(evaluation.stable_key);
      const rubric = question?.bodyMarkdown.trim().length
        ? question.bodyMarkdown.trim()
        : "No additional rubric.";
      return [
        `stable_key: ${evaluation.stable_key}`,
        `axis: ${evaluation.axis}`,
        `prompt_text: ${evaluation.prompt_text}`,
        `draft_score_int: ${evaluation.score_int}`,
        `draft_confidence: ${evaluation.confidence ?? "null"}`,
        `draft_rationale: ${evaluation.rationale}`,
        "rubric:",
        rubric,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return [
    "You are performing a calibration pass over draft survey scores.",
    "Review the draft scores and rationales, cross-check with the rubric for each question,",
    "and return the final calibrated scores for every stable_key.",
    "Return only valid JSON matching the required schema.",
    "",
    "Nudge:",
    `title: ${nudge.title}`,
    `body: ${nudge.body}`,
    "",
    "Draft evaluations and rubrics:",
    draftText,
  ].join("\n");
};

export const evaluateSingle = async (
  modelClient: JudgeModelClient,
  nudge: NudgeInput,
  questions: SurveyQuestion[],
): Promise<{
  evaluations: QuestionEvaluation[];
  rawResponses: Record<string, string>;
}> => {
  const prompt = buildJudgePrompt(nudge, questions);
  const response = await modelClient.generateJson({
    prompt,
    responseSchemaName: JUDGE_SCHEMA_NAME,
    responseSchema: JUDGE_JSON_SCHEMA,
  });
  const scores = parseScores(response.parsed);
  return {
    evaluations: mergeScoresWithQuestions(questions, scores),
    rawResponses: { single: response.raw },
  };
};

export const evaluateAxisBatchedGrouped = async (
  modelClient: JudgeModelClient,
  nudge: NudgeInput,
  questions: SurveyQuestion[],
): Promise<{
  evaluations: QuestionEvaluation[];
  rawResponses: Record<string, string>;
}> => {
  const allScores: QuestionScore[] = [];
  const rawResponses: Record<string, string> = {};

  for (const group of GROUPED_AXES) {
    const groupQuestions = questions.filter((question) =>
      group.axes.includes(question.axis),
    );
    if (groupQuestions.length === 0) {
      continue;
    }
    const prompt = buildJudgePrompt(nudge, groupQuestions);
    const response = await modelClient.generateJson({
      prompt,
      responseSchemaName: JUDGE_SCHEMA_NAME,
      responseSchema: JUDGE_JSON_SCHEMA,
    });
    rawResponses[group.id] = response.raw;
    const parsedScores = parseScores(response.parsed);
    allScores.push(...parsedScores);
  }

  return {
    evaluations: mergeScoresWithQuestions(questions, allScores),
    rawResponses,
  };
};

export const evaluateTwoStageScaffold = async (
  modelClient: JudgeModelClient,
  nudge: NudgeInput,
  questions: SurveyQuestion[],
): Promise<{
  evaluations: QuestionEvaluation[];
  rawResponses: Record<string, string>;
}> => {
  const stageOne = await evaluateAxisBatchedGrouped(
    modelClient,
    nudge,
    questions,
  );
  const calibrationPrompt = buildTwoStageCalibrationPrompt(
    nudge,
    questions,
    stageOne.evaluations,
  );

  const stageTwo = await modelClient.generateJson({
    prompt: calibrationPrompt,
    responseSchemaName: JUDGE_SCHEMA_NAME,
    responseSchema: JUDGE_JSON_SCHEMA,
  });

  const calibratedScores = parseScores(stageTwo.parsed);
  return {
    evaluations: mergeScoresWithQuestions(questions, calibratedScores),
    rawResponses: {
      ...Object.fromEntries(
        Object.entries(stageOne.rawResponses).map(([key, value]) => [
          `stage1_${key}`,
          value,
        ]),
      ),
      stage2_calibration: stageTwo.raw,
    },
  };
};
