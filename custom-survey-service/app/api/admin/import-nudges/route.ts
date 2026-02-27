//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/db/server";
import { stableHash } from "@/lib/hash";

const nudgeSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  sourceModel: z.string().optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
});

const bodySchema = z.object({
  nudges: z.array(nudgeSchema).min(1),
});

export const POST = async (request: Request) => {
  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const rows = parsed.data.nudges.map((nudge) => {
    const metadataJson = nudge.metadataJson ?? {};
    return {
      dedupe_key: stableHash(
        `${nudge.title.trim()}::${nudge.body.trim()}::${nudge.sourceModel ?? ""}::${JSON.stringify(metadataJson)}`,
      ),
      title: nudge.title.trim(),
      body: nudge.body.trim(),
      source_model: nudge.sourceModel ?? null,
      metadata_json: metadataJson,
    };
  });

  const { error } = await supabase.from("nudges").upsert(rows, {
    onConflict: "dedupe_key",
  });

  if (error) {
    return NextResponse.json({ error: "Import failed." }, { status: 500 });
  }

  return NextResponse.json({ imported: rows.length });
};
