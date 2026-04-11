//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurveyQuestionsFromSql } from "./loadSurveyQuestions.js";
import { JudgeModelClient } from "./modelClient.js";
import { writeArtifacts } from "./output.js";
import {
  evaluateAxisBatchedGrouped,
  evaluateSingle,
  evaluateTwoStageScaffold,
} from "./strategies.js";
import {
  type JudgeRunOutput,
  type JudgeStrategy,
  type NudgeInput,
} from "./types.js";

interface CliArgs {
  modelId: string;
  strategy: JudgeStrategy;
  sqlPath: string;
  inputPath?: string;
  nudgeId?: string;
  title?: string;
  body?: string;
  contextJson?: string;
  includeInactive: boolean;
  outputJsonPath: string;
  outputCsvPath: string;
}

const DEFAULT_MODEL_ID = "gpt-5.2-2025-12-11";
const DEFAULT_STRATEGY: JudgeStrategy = "axis-batched-grouped";

const getDefaultPaths = (): {
  sqlPath: string;
  outputJsonPath: string;
  outputCsvPath: string;
} => {
  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), "../../../");
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return {
    sqlPath: path.join(
      repoRoot,
      "custom-survey-service/supabase/migrations/20260223_init.sql",
    ),
    outputJsonPath: path.join(
      repoRoot,
      `data/evaluated/llm_judge_${timestamp}.json`,
    ),
    outputCsvPath: path.join(
      repoRoot,
      `data/evaluated/llm_judge_${timestamp}.csv`,
    ),
  };
};

const parseArgs = (): CliArgs => {
  const defaults = getDefaultPaths();
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    modelId: DEFAULT_MODEL_ID,
    strategy: DEFAULT_STRATEGY,
    sqlPath: defaults.sqlPath,
    includeInactive: false,
    outputJsonPath: defaults.outputJsonPath,
    outputCsvPath: defaults.outputCsvPath,
  };

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    switch (key) {
      case "--model-id":
        parsed.modelId = value;
        index += 1;
        break;
      case "--strategy":
        if (
          value !== "single" &&
          value !== "axis-batched-grouped" &&
          value !== "two-stage"
        ) {
          throw new Error(`Invalid --strategy ${value}`);
        }
        parsed.strategy = value;
        index += 1;
        break;
      case "--sql-path":
        parsed.sqlPath = path.resolve(value);
        index += 1;
        break;
      case "--input":
        parsed.inputPath = path.resolve(value);
        index += 1;
        break;
      case "--nudge-id":
        parsed.nudgeId = value;
        index += 1;
        break;
      case "--title":
        parsed.title = value;
        index += 1;
        break;
      case "--body":
        parsed.body = value;
        index += 1;
        break;
      case "--context-json":
        parsed.contextJson = value;
        index += 1;
        break;
      case "--include-inactive":
        parsed.includeInactive = true;
        break;
      case "--output-json":
        parsed.outputJsonPath = path.resolve(value);
        index += 1;
        break;
      case "--output-csv":
        parsed.outputCsvPath = path.resolve(value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${key}`);
    }
  }

  return parsed;
};

const parseNudgeInput = async (args: CliArgs): Promise<NudgeInput> => {
  if (args.inputPath) {
    const content = await readFile(args.inputPath, "utf8");
    const parsed = JSON.parse(content) as {
      nudgeId?: string;
      title?: string;
      body?: string;
      context?: Record<string, unknown>;
    };
    if (!parsed.title || !parsed.body) {
      throw new Error("Input JSON must contain title and body");
    }
    return {
      nudgeId: parsed.nudgeId ?? "adhoc-nudge",
      title: parsed.title,
      body: parsed.body,
      context: parsed.context,
    };
  }

  if (!args.title || !args.body) {
    throw new Error("Provide --input JSON or both --title and --body");
  }

  return {
    nudgeId: args.nudgeId ?? "adhoc-nudge",
    title: args.title,
    body: args.body,
    context: args.contextJson
      ? (JSON.parse(args.contextJson) as Record<string, unknown>)
      : undefined,
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const nudge = await parseNudgeInput(args);
  const questions = await loadSurveyQuestionsFromSql(
    args.sqlPath,
    args.includeInactive,
  );
  const modelClient = new JudgeModelClient(args.modelId);

  const evaluationResult =
    args.strategy === "single"
      ? await evaluateSingle(modelClient, nudge, questions)
      : args.strategy === "two-stage"
        ? await evaluateTwoStageScaffold(modelClient, nudge, questions)
        : await evaluateAxisBatchedGrouped(modelClient, nudge, questions);

  const output: JudgeRunOutput = {
    run: {
      strategy: args.strategy,
      modelId: modelClient.modelConfig.id,
      provider: modelClient.modelConfig.provider,
      createdAt: new Date().toISOString(),
      promptVersion: "v1",
    },
    nudge,
    questions,
    evaluations: evaluationResult.evaluations,
    rawResponses: evaluationResult.rawResponses,
  };

  await writeArtifacts(output, args.outputJsonPath, args.outputCsvPath);

  process.stdout.write(
    `Wrote llm-as-judge outputs:\n- JSON: ${args.outputJsonPath}\n- CSV: ${args.outputCsvPath}\n`,
  );
};

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
