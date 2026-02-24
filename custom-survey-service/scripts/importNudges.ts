import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

type CsvRow = {
  modelId?: string;
  genderIdentity?: string;
  ageGroup?: string;
  disease?: string;
  stateOfChange?: string;
  educationLevel?: string;
  language?: string;
  preferredNotificationTime?: string;
  genderContext?: string;
  ageContext?: string;
  diseaseContext?: string;
  stageContext?: string;
  educationContext?: string;
  languageContext?: string;
  notificationTimeContext?: string;
  llmResponse?: string;
};

type Nudge = {
  title: string;
  body: string;
  source_model: string | null;
  dedupe_key: string;
  metadata_json: Record<string, unknown>;
};

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function parseResponse(raw: string): Array<{ title: string; body: string }> {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as Array<{ title: string; body: string }>;
  }
  if (parsed && typeof parsed === "object" && "nudges" in parsed) {
    return (parsed as { nudges: Array<{ title: string; body: string }> }).nudges;
  }
  return [];
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildMetadataJson(row: CsvRow): Record<string, unknown> {
  const promptMetadata = {
    gender: normalizeText(row.genderIdentity),
    age_group: normalizeText(row.ageGroup),
    comorbidities: normalizeText(row.disease),
    stage_of_change: normalizeText(row.stateOfChange),
    education_level: normalizeText(row.educationLevel),
    language: normalizeText(row.language),
    preferred_notification_time: normalizeText(row.preferredNotificationTime)
  };

  const promptContext = {
    gender: normalizeText(row.genderContext),
    age: normalizeText(row.ageContext),
    comorbidities: normalizeText(row.diseaseContext),
    stage_of_change: normalizeText(row.stageContext),
    education_level: normalizeText(row.educationContext),
    language: normalizeText(row.languageContext),
    preferred_notification_time: normalizeText(row.notificationTimeContext)
  };

  return {
    prompt_metadata: promptMetadata,
    prompt_context: promptContext
  };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npm run import:nudges -- <csv-file-path>");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, "utf-8");
  const rows = parse(content, { columns: true, skip_empty_lines: true }) as CsvRow[];

  const nudges: Nudge[] = [];
  for (const row of rows) {
    if (!row.llmResponse) {
      continue;
    }
    const parsedNudges = parseResponse(row.llmResponse);
    const metadataJson = buildMetadataJson(row);
    const metadataFingerprint = JSON.stringify(metadataJson);
    for (const nudge of parsedNudges) {
      const title = nudge.title?.trim();
      const body = nudge.body?.trim();
      if (!title || !body) {
        continue;
      }
      nudges.push({
        title,
        body,
        source_model: row.modelId ?? null,
        dedupe_key: hash(
          `${title}::${body}::${row.modelId ?? ""}::${metadataFingerprint}`
        ),
        metadata_json: metadataJson
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  const { error } = await supabase.from("nudges").upsert(nudges, {
    onConflict: "dedupe_key"
  });
  if (error) {
    throw error;
  }

  console.log(`Imported ${nudges.length} nudge rows from ${absolutePath}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
