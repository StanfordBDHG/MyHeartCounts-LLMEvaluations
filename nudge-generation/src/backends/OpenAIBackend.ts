//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import OpenAI from "openai";
import { type ModelBackend, type GenerateOptions } from "./ModelBackend.js";
import { type ModelConfig } from "../config/models.js";
import {
  NUDGE_MESSAGES_JSON_SCHEMA,
  NUDGE_MESSAGES_SCHEMA_NAME,
} from "../config/nudgeResponseSchema.js";

export class OpenAIBackend implements ModelBackend {
  readonly modelId: string;
  readonly provider = "openai" as const;
  private openai: OpenAI;

  constructor(config: ModelConfig, openAIApiKey: string) {
    this.modelId = config.id;
    this.openai = new OpenAI({
      apiKey: openAIApiKey,
    });
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const timeout: number =
      typeof options?.timeout === "number" ? options.timeout : 120000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.openai.chat.completions.create(
        {
          model: this.modelId,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: options?.maxTokens,
          temperature: options?.temperature,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: NUDGE_MESSAGES_SCHEMA_NAME,
              schema: NUDGE_MESSAGES_JSON_SCHEMA,
            },
          },
        },
        {
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);
      return response.choices[0].message.content ?? "";
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Request timeout after ${timeout / 1000} seconds`);
        }
        throw error;
      }
      throw new Error(`Unknown error: ${String(error)}`);
    }
  }

  supportsModel(modelId: string): boolean {
    return modelId === this.modelId;
  }
}
