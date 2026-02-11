//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { MLXPythonBackend } from "./MLXPythonBackend.js";
import { type ModelBackend } from "./ModelBackend.js";
import { OpenAIBackend } from "./OpenAIBackend.js";
import { SecureGPTBackend } from "./SecureGPTBackend.js";
import { type ModelConfig } from "../config/models.js";

const createBackend = (
  config: ModelConfig,
  openAIApiKey?: string,
  pythonServiceUrl?: string,
  secureGPTApiKey?: string,
): ModelBackend => {
  switch (config.provider) {
    case "openai":
      if (!openAIApiKey) {
        throw new Error("OpenAI API key is required for OpenAI models");
      }
      return new OpenAIBackend(config, openAIApiKey);
    case "mlx-python":
      return new MLXPythonBackend(config, pythonServiceUrl);
    case "securegpt":
      if (!secureGPTApiKey) {
        throw new Error("SecureGPT API key is required for SecureGPT models");
      }
      return new SecureGPTBackend(config, secureGPTApiKey);
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unsupported provider: ${String(_exhaustive)}`);
    }
  }
};

export const BackendFactory = {
  create: createBackend,
};
