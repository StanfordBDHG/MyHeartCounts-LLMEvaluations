//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

export interface PromptContextInput {
  genderIdentity: string;
  ageGroup: string;
  disease: string | null;
  stageOfChange: string | null;
  educationLevel: string;
  language: string;
  preferredNotificationTime: string;
}

type PromptSnippetCategory =
  | "genderIdentity"
  | "ageGroup"
  | "disease"
  | "stageOfChange"
  | "educationLevel"
  | "language";

interface PromptConstants {
  schemaVersion: string;
  baseNudgeInstruction: string;
  templates: {
    notificationTimeContext: string;
    fullPromptAssembly: string;
  };
  contextSnippets: Record<PromptSnippetCategory, Record<string, string>>;
  defaults: Record<PromptSnippetCategory, string>;
}

let cachedPromptConstants: PromptConstants | null = null;
let checkedPromptSchema = false;

const getDefaultPromptConstantsPath = (): string => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(
    __dirname,
    "../../config/prompts/prompt_constants.v1.json",
  );
};

const getDefaultPromptSchemaPath = (): string => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(
    __dirname,
    "../../config/prompts/prompt_constants.schema.json",
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getStringRecord = (
  value: unknown,
  errorPrefix: string,
): Record<string, string> => {
  if (!isRecord(value)) {
    throw new Error(`${errorPrefix} must be an object`);
  }
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new Error(`${errorPrefix}.${key} must be a string`);
    }
    output[key] = item;
  }
  return output;
};

const validatePromptConstants = (
  raw: unknown,
  sourcePath: string,
): PromptConstants => {
  if (!isRecord(raw)) {
    throw new Error(`Prompt constants at ${sourcePath} must be a JSON object`);
  }

  if (
    typeof raw.schemaVersion !== "string" ||
    raw.schemaVersion.trim().length === 0
  ) {
    throw new Error(`schemaVersion is missing or invalid in ${sourcePath}`);
  }
  if (
    typeof raw.baseNudgeInstruction !== "string" ||
    raw.baseNudgeInstruction.trim().length === 0
  ) {
    throw new Error(
      `baseNudgeInstruction is missing or invalid in ${sourcePath}`,
    );
  }
  if (!isRecord(raw.templates)) {
    throw new Error(`templates is missing or invalid in ${sourcePath}`);
  }
  if (typeof raw.templates.notificationTimeContext !== "string") {
    throw new Error(`templates.notificationTimeContext must be a string`);
  }
  if (
    !raw.templates.notificationTimeContext.includes(
      "{{preferredNotificationTime}}",
    )
  ) {
    throw new Error(
      "templates.notificationTimeContext must include {{preferredNotificationTime}}",
    );
  }
  if (typeof raw.templates.fullPromptAssembly !== "string") {
    throw new Error(`templates.fullPromptAssembly must be a string`);
  }

  if (!isRecord(raw.contextSnippets)) {
    throw new Error(`contextSnippets is missing or invalid in ${sourcePath}`);
  }
  if (!isRecord(raw.defaults)) {
    throw new Error(`defaults is missing or invalid in ${sourcePath}`);
  }

  const categories: PromptSnippetCategory[] = [
    "genderIdentity",
    "ageGroup",
    "disease",
    "stageOfChange",
    "educationLevel",
    "language",
  ];

  const contextSnippets = {} as Record<
    PromptSnippetCategory,
    Record<string, string>
  >;
  const defaults = {} as Record<PromptSnippetCategory, string>;

  for (const category of categories) {
    contextSnippets[category] = getStringRecord(
      raw.contextSnippets[category],
      `contextSnippets.${category}`,
    );
    const defaultValue = raw.defaults[category];
    if (typeof defaultValue !== "string") {
      throw new Error(`defaults.${category} must be a string`);
    }
    defaults[category] = defaultValue;
  }

  return {
    schemaVersion: raw.schemaVersion,
    baseNudgeInstruction: raw.baseNudgeInstruction,
    templates: {
      notificationTimeContext: raw.templates.notificationTimeContext,
      fullPromptAssembly: raw.templates.fullPromptAssembly,
    },
    contextSnippets,
    defaults,
  };
};

export const loadPromptConstants = (filePath?: string): PromptConstants => {
  if (!filePath && cachedPromptConstants) {
    return cachedPromptConstants;
  }

  const resolvedPath = path.resolve(
    filePath ?? getDefaultPromptConstantsPath(),
  );
  const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as unknown;
  const validated = validatePromptConstants(parsed, resolvedPath);

  if (!checkedPromptSchema) {
    const schemaPath = getDefaultPromptSchemaPath();
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as unknown;
    if (!isRecord(schema) || typeof schema.$schema !== "string") {
      throw new Error(`Prompt constants schema is invalid at ${schemaPath}`);
    }
    checkedPromptSchema = true;
  }

  if (!filePath) {
    cachedPromptConstants = validated;
  }

  return validated;
};

export const renderTemplate = (
  template: string,
  values: Record<string, string>,
): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");

export const getContextSnippet = (
  constants: PromptConstants,
  category: PromptSnippetCategory,
  key: string | null,
): string => {
  if (!key) {
    return constants.defaults[category];
  }
  return (
    constants.contextSnippets[category][key] ?? constants.defaults[category]
  );
};

export const buildPrompt = (
  context: PromptContextInput,
  filePath?: string,
): string => {
  const constants = loadPromptConstants(filePath);
  const languageContext = getContextSnippet(
    constants,
    "language",
    context.language,
  );
  const genderContext = getContextSnippet(
    constants,
    "genderIdentity",
    context.genderIdentity,
  );
  const ageContext = getContextSnippet(constants, "ageGroup", context.ageGroup);
  const diseaseContext = getContextSnippet(
    constants,
    "disease",
    context.disease,
  );
  const stageContext = getContextSnippet(
    constants,
    "stageOfChange",
    context.stageOfChange,
  );
  const educationContext = getContextSnippet(
    constants,
    "educationLevel",
    context.educationLevel,
  );
  const notificationTimeContext = renderTemplate(
    constants.templates.notificationTimeContext,
    {
      preferredNotificationTime: context.preferredNotificationTime,
    },
  );

  return renderTemplate(constants.templates.fullPromptAssembly, {
    baseNudgeInstruction: constants.baseNudgeInstruction,
    languageContext,
    genderContext,
    ageContext,
    diseaseContext,
    stageContext,
    educationContext,
    notificationTimeContext,
  });
};
