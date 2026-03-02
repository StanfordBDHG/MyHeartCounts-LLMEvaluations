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
import bcrypt from "bcryptjs";
import { parse } from "csv-parse/sync";

interface EvaluatorCsvRow {
  email?: string;
  evaluator_id?: string;
  active?: string;
}

const main = async () => {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npm run import:evaluators -- <csv-file-path>");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const csv = await fs.readFile(path.resolve(filePath), "utf-8");
  const rows: EvaluatorCsvRow[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
  });

  const upserts: Array<{
    email: string;
    evaluator_code_hash: string;
    active: boolean;
  }> = [];
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    const evaluatorId = row.evaluator_id?.trim();
    if (!email || !evaluatorId) {
      continue;
    }
    upserts.push({
      email,
      evaluator_code_hash: await bcrypt.hash(evaluatorId, 10),
      active: row.active?.trim().toLowerCase() !== "false",
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase
    .from("evaluators")
    .upsert(upserts, { onConflict: "email" });
  if (error) {
    throw error;
  }

  console.log(`Imported ${upserts.length} evaluators.`);
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
