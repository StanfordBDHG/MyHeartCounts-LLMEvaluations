//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { BackendFactory } from "../../../nudge-generation/src/backends/BackendFactory.js";
import { type ModelBackend } from "../../../nudge-generation/src/backends/ModelBackend.js";
import {
  MODEL_CONFIGS,
  type ModelConfig,
} from "../../../nudge-generation/src/config/models.js";

type JudgeModelConfig = ModelConfig & { provider: "openai" | "securegpt" };

export interface GenerateJsonParams {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  responseSchemaName: string;
  responseSchema: Record<string, unknown>;
}

const cleanJsonLikeText = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
};

export class JudgeModelClient {
  readonly modelConfig: JudgeModelConfig;
  readonly backend: ModelBackend;

  constructor(modelId: string) {
    const modelConfig = MODEL_CONFIGS.find(
      (candidate) => candidate.id === modelId,
    );
    if (!modelConfig) {
      throw new Error(`Unknown model id: ${modelId}`);
    }
    if (
      modelConfig.provider !== "openai" &&
      modelConfig.provider !== "securegpt"
    ) {
      throw new Error(
        `Model provider ${modelConfig.provider} is unsupported for llm-as-judge. Use openai or securegpt models.`,
      );
    }

    const openAIApiKey = process.env.OPENAI_API_KEY;
    const secureGPTApiKey = process.env.SECUREGPT_API_KEY;
    const judgeModelConfig = modelConfig as JudgeModelConfig;
    this.backend = BackendFactory.create(
      modelConfig,
      openAIApiKey,
      undefined,
      secureGPTApiKey,
    );
    this.modelConfig = judgeModelConfig;
  }

  async generateJson(
    params: GenerateJsonParams,
  ): Promise<{ parsed: unknown; raw: string }> {
    const timeoutMs =
      params.timeoutMs ?? (this.modelConfig.config?.timeout ?? 120) * 1000;

    const raw = await this.backend.generate(params.prompt, {
      maxTokens: params.maxTokens ?? 1600,
      temperature: params.temperature ?? 0.1,
      timeout: timeoutMs,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.responseSchemaName,
          schema: params.responseSchema,
        },
      },
    });

    const cleaned = cleanJsonLikeText(raw);
    const parsed: unknown = JSON.parse(cleaned);
    return { parsed, raw };
  }
}
