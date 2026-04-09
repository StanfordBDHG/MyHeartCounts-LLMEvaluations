//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type JudgeRunOutput } from "./types.js";

const escapeCsvCell = (value: string): string => {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
};

const toCsv = (data: JudgeRunOutput): string => {
  const headers = [
    "run_created_at",
    "strategy",
    "model_id",
    "provider",
    "nudge_id",
    "nudge_title",
    "nudge_body",
    "stable_key",
    "axis",
    "response_type",
    "score_int",
    "confidence",
    "rationale",
  ];

  const rows = data.evaluations.map((evaluation) => [
    data.run.createdAt,
    data.run.strategy,
    data.run.modelId,
    data.run.provider,
    data.nudge.nudgeId,
    data.nudge.title,
    data.nudge.body,
    evaluation.stable_key,
    evaluation.axis,
    evaluation.response_type,
    String(evaluation.score_int),
    evaluation.confidence === null ? "" : String(evaluation.confidence),
    evaluation.rationale,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");
};

export const writeArtifacts = async (
  data: JudgeRunOutput,
  outputJsonPath: string,
  outputCsvPath: string,
): Promise<void> => {
  await mkdir(path.dirname(outputJsonPath), { recursive: true });
  await mkdir(path.dirname(outputCsvPath), { recursive: true });

  await writeFile(outputJsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(outputCsvPath, `${toCsv(data)}\n`, "utf8");
};
