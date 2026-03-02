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

const readAdminTokenFromHeaders = (request: Request): string | null => {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const [scheme, ...rest] = authHeader.trim().split(/\s+/);
    if (scheme.toLowerCase() === "bearer" && rest.length > 0) {
      return rest.join(" ");
    }
    return authHeader.trim();
  }

  return request.headers.get("x-admin-token");
};

const canonicalizeForJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalizeForJson);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [
        key,
        canonicalizeForJson(nestedValue),
      ]),
    );
  }
  return value;
};

const canonicalJsonStringify = (value: unknown): string =>
  JSON.stringify(canonicalizeForJson(value));

export const POST = async (request: Request) => {
  const expectedToken = process.env.ADMIN_EXPORT_TOKEN;
  const providedToken = readAdminTokenFromHeaders(request);

  if (!expectedToken || !providedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
        `${nudge.title.trim()}::${nudge.body.trim()}::${nudge.sourceModel ?? ""}::${canonicalJsonStringify(metadataJson)}`,
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
