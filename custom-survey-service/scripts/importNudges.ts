//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { stableHash } from "@/lib/hash";

interface CsvRow {
  modelId?: string;
  genderIdentity?: string;
  ageGroup?: string;
  disease?: string;
  stageOfChange?: string;
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
  sampledNudgeJson?: string;
  nudgeJson?: string;
}

interface Nudge {
  title: string;
  body: string;
  source_model: string | null;
  dedupe_key: string;
  metadata_json: Record<string, unknown>;
  active: boolean;
  eligible_standard: boolean;
  eligible_doctor: boolean;
}

interface ParsedArgs {
  csvPath: string;
  eligibleStandard: boolean;
  eligibleDoctor: boolean;
}

const parseBooleanFlag = (raw: string, flagName: string): boolean => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error(
    `Invalid value for --${flagName}: "${raw}". Expected true|false.`,
  );
};

const parseArgs = (): ParsedArgs => {
  // Defaults preserve the historical behavior of this importer: standard-only
  // unless the caller opts the new rows into the doctor pool.
  let eligibleStandard = true;
  let eligibleDoctor = false;
  const positional: string[] = [];

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--eligible-standard=")) {
      eligibleStandard = parseBooleanFlag(
        arg.slice("--eligible-standard=".length),
        "eligible-standard",
      );
    } else if (arg.startsWith("--eligible-doctor=")) {
      eligibleDoctor = parseBooleanFlag(
        arg.slice("--eligible-doctor=".length),
        "eligible-doctor",
      );
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error(
      "Usage: npm run import:nudges -- <csv-file-path> [--eligible-standard=true|false] [--eligible-doctor=true|false]",
    );
  }

  if (!eligibleStandard && !eligibleDoctor) {
    throw new Error(
      "Refusing to import nudges with both --eligible-standard=false and --eligible-doctor=false; the rows would never be selectable.",
    );
  }

  return {
    csvPath: positional[0],
    eligibleStandard,
    eligibleDoctor,
  };
};

const parseResponse = (raw: string): Array<{ title: string; body: string }> => {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as Array<{ title: string; body: string }>;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    "title" in parsed &&
    "body" in parsed
  ) {
    return [parsed as { title: string; body: string }];
  }
  if (parsed && typeof parsed === "object" && "nudges" in parsed) {
    return (parsed as { nudges: Array<{ title: string; body: string }> })
      .nudges;
  }
  return [];
};

type NudgeJsonColumn = "llmResponse" | "sampledNudgeJson" | "nudgeJson";

const getRawResponse = (
  row: CsvRow,
): { raw: string; sourceColumn: NudgeJsonColumn } | null => {
  const llmResponse = row.llmResponse?.trim();
  if (llmResponse) {
    return { raw: llmResponse, sourceColumn: "llmResponse" };
  }
  const sampledNudgeJson = row.sampledNudgeJson?.trim();
  if (sampledNudgeJson) {
    return { raw: sampledNudgeJson, sourceColumn: "sampledNudgeJson" };
  }
  const nudgeJson = row.nudgeJson?.trim();
  if (nudgeJson) {
    return { raw: nudgeJson, sourceColumn: "nudgeJson" };
  }
  return null;
};

const normalizeText = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ?? null;
};

const buildMetadataJson = (row: CsvRow): Record<string, unknown> => {
  const promptMetadata = {
    gender: normalizeText(row.genderIdentity),
    age_group: normalizeText(row.ageGroup),
    comorbidities: normalizeText(row.disease),
    stage_of_change: normalizeText(row.stageOfChange),
    education_level: normalizeText(row.educationLevel),
    language: normalizeText(row.language),
    preferred_notification_time: normalizeText(row.preferredNotificationTime),
  };

  const promptContext = {
    gender: normalizeText(row.genderContext),
    age: normalizeText(row.ageContext),
    comorbidities: normalizeText(row.diseaseContext),
    stage_of_change: normalizeText(row.stageContext),
    education_level: normalizeText(row.educationContext),
    language: normalizeText(row.languageContext),
    preferred_notification_time: normalizeText(row.notificationTimeContext),
  };

  return {
    prompt_metadata: promptMetadata,
    prompt_context: promptContext,
  };
};

const main = async () => {
  const args = parseArgs();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const absolutePath = path.resolve(args.csvPath);
  const content = await fs.readFile(absolutePath, "utf-8");
  const rows: CsvRow[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
  });

  const nudges: Nudge[] = [];
  let skippedMalformedJsonRows = 0;
  for (const [index, row] of rows.entries()) {
    const response = getRawResponse(row);
    if (!response) {
      continue;
    }
    let parsedNudges: Array<{ title: string; body: string }> = [];
    try {
      parsedNudges = parseResponse(response.raw);
    } catch (error: unknown) {
      skippedMalformedJsonRows += 1;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `Skipping row ${index + 2}: malformed JSON in ${response.sourceColumn} (${reason})`,
      );
      continue;
    }
    const metadataJson = buildMetadataJson(row);
    const metadataFingerprint = JSON.stringify(metadataJson);
    for (const nudge of parsedNudges) {
      const title = nudge.title.trim();
      const body = nudge.body.trim();
      if (!title || !body) {
        continue;
      }
      nudges.push({
        title,
        body,
        source_model: row.modelId ?? null,
        dedupe_key: stableHash(
          `${title}::${body}::${row.modelId ?? ""}::${metadataFingerprint}`,
        ),
        metadata_json: metadataJson,
        active: true,
        eligible_standard: args.eligibleStandard,
        eligible_doctor: args.eligibleDoctor,
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  // Pre-fetch existing rows for two reasons:
  // 1. Reconcile-by-content: a CSV nudge whose (title, body) matches a row
  //    in the DB but has different metadata/model would otherwise be inserted
  //    as a duplicate. We want to *flip eligibility flags* on the existing
  //    row instead of inserting a near-duplicate, and we want to OR flags so
  //    that re-running with --eligible-doctor=true never demotes an existing
  //    standard nudge.
  // 2. Reporting: print a clear summary of new vs. matched-by-content rows.
  interface ExistingNudgeRow {
    id: string;
    title: string;
    body: string;
    dedupe_key: string;
    eligible_standard: boolean;
    eligible_doctor: boolean;
    active: boolean;
  }
  const { data: existingRowsRaw, error: existingFetchError } = await supabase
    .from("nudges")
    .select(
      "id, title, body, dedupe_key, eligible_standard, eligible_doctor, active",
    );
  if (existingFetchError) {
    throw existingFetchError;
  }
  const existingRows = existingRowsRaw as ExistingNudgeRow[];

  const existingByDedupeKey = new Map<string, ExistingNudgeRow>();
  const existingByContent = new Map<string, ExistingNudgeRow>();
  for (const row of existingRows) {
    existingByDedupeKey.set(row.dedupe_key, row);
    existingByContent.set(`${row.title}\u0000${row.body}`, row);
  }

  // Partition CSV nudges into:
  //   - rowsToInsert: no DB match by dedupe_key OR by (title, body). Pure
  //     new rows, inserted with the requested eligibility flags as-is.
  //   - rowsToReconcile: a DB match exists (either by dedupe_key, or by
  //     content under different metadata). We never insert these. We only
  //     UPDATE the eligibility flags using OR semantics so re-running with
  //     a narrower flag set (for example --eligible-standard=false during a
  //     doctor-flow import) never demotes a row that was already in the
  //     standard pool.
  const rowsToInsert: Nudge[] = [];
  interface ReconcileItem {
    existingId: string;
    existingTitle: string;
    matchedBy: "dedupe_key" | "content";
    currentEligibleStandard: boolean;
    currentEligibleDoctor: boolean;
  }
  const rowsToReconcile: ReconcileItem[] = [];
  const seenExistingIds = new Set<string>();

  for (const csvNudge of nudges) {
    const dedupeMatch = existingByDedupeKey.get(csvNudge.dedupe_key);
    const contentMatch = existingByContent.get(
      `${csvNudge.title}\u0000${csvNudge.body}`,
    );
    const match = dedupeMatch ?? contentMatch;
    if (!match) {
      rowsToInsert.push(csvNudge);
      continue;
    }
    if (seenExistingIds.has(match.id)) {
      // Another CSV row already mapped to this DB row; skip duplicate work.
      continue;
    }
    seenExistingIds.add(match.id);
    rowsToReconcile.push({
      existingId: match.id,
      existingTitle: match.title,
      matchedBy: dedupeMatch ? "dedupe_key" : "content",
      currentEligibleStandard: match.eligible_standard,
      currentEligibleDoctor: match.eligible_doctor,
    });
  }

  // Step 1: insert pure-new rows. We use a plain insert (no upsert) because
  // partitioning above guarantees there is no existing row with the same
  // dedupe_key.
  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("nudges")
      .insert(rowsToInsert);
    if (insertError) {
      throw insertError;
    }
  }

  // Step 2: reconcile existing-row matches with OR'd eligibility flags.
  let reconciledRowsTouched = 0;
  for (const reconcile of rowsToReconcile) {
    const nextStandard =
      reconcile.currentEligibleStandard || args.eligibleStandard;
    const nextDoctor = reconcile.currentEligibleDoctor || args.eligibleDoctor;
    if (
      nextStandard === reconcile.currentEligibleStandard &&
      nextDoctor === reconcile.currentEligibleDoctor
    ) {
      continue;
    }
    const { error: updateError } = await supabase
      .from("nudges")
      .update({
        eligible_standard: nextStandard,
        eligible_doctor: nextDoctor,
      })
      .eq("id", reconcile.existingId);
    if (updateError) {
      throw updateError;
    }
    reconciledRowsTouched += 1;
  }

  const matchedByDedupe = rowsToReconcile.filter(
    (r) => r.matchedBy === "dedupe_key",
  ).length;
  const matchedByContent = rowsToReconcile.filter(
    (r) => r.matchedBy === "content",
  ).length;

  console.log(`Imported from ${absolutePath}`);
  console.log(`  CSV nudges parsed: ${nudges.length}`);
  console.log(`  Inserted as new: ${rowsToInsert.length}`);
  console.log(
    `  Existing matches reconciled (OR'd flags): ${reconciledRowsTouched} of ${rowsToReconcile.length}`,
  );
  console.log(
    `    by dedupe_key (same content + metadata): ${matchedByDedupe}`,
  );
  console.log(
    `    by (title, body) only (different metadata): ${matchedByContent}`,
  );
  console.log(
    `  Eligibility requested for new rows: standard=${args.eligibleStandard}, doctor=${args.eligibleDoctor}`,
  );
  if (rowsToReconcile.length > 0) {
    console.log("  Reconciled rows:");
    for (const reconcile of rowsToReconcile) {
      console.log(
        `    - [${reconcile.matchedBy}] ${reconcile.existingId} ${JSON.stringify(reconcile.existingTitle)}`,
      );
    }
  }
  if (skippedMalformedJsonRows > 0) {
    console.log(
      `  Skipped ${skippedMalformedJsonRows} CSV row(s) due to malformed JSON.`,
    );
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
