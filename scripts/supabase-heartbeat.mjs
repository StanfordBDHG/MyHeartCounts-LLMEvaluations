#!/usr/bin/env node
//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Keeps a Supabase project active by upserting a single heartbeat row.
 *
 * Required env vars:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env vars:
 * - SUPABASE_HEARTBEAT_TABLE (default: heartbeat)
 * - SUPABASE_HEARTBEAT_ID (default: 1)
 * - SUPABASE_HEARTBEAT_SCHEMA (default: public)
 */

const nonEmptyOrUndefined = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const SUPABASE_URL = nonEmptyOrUndefined(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = nonEmptyOrUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY);
const HEARTBEAT_TABLE = nonEmptyOrUndefined(process.env.SUPABASE_HEARTBEAT_TABLE) ?? "heartbeat";
const HEARTBEAT_ID = Number(nonEmptyOrUndefined(process.env.SUPABASE_HEARTBEAT_ID) ?? "1");
const HEARTBEAT_SCHEMA = nonEmptyOrUndefined(process.env.SUPABASE_HEARTBEAT_SCHEMA) ?? "public";

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

if (!Number.isFinite(HEARTBEAT_ID)) {
  throw new Error("SUPABASE_HEARTBEAT_ID must be a number");
}

const normalizedBaseUrl = SUPABASE_URL.replace(/\/+$/, "");
const endpoint = `${normalizedBaseUrl}/rest/v1/${encodeURIComponent(HEARTBEAT_TABLE)}`;

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=representation",
  "Accept-Profile": HEARTBEAT_SCHEMA,
  "Content-Profile": HEARTBEAT_SCHEMA,
};

const payload = [{ id: HEARTBEAT_ID, last_ping: new Date().toISOString() }];

const response = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const errorBody = await response.text();
  throw new Error(
    [
      `Heartbeat upsert failed (${response.status} ${response.statusText})`,
      `Endpoint: ${endpoint}`,
      "Make sure the heartbeat table exists and has columns:",
      "- id (primary key)",
      "- last_ping (timestamptz)",
      `Response: ${errorBody}`,
    ].join("\n")
  );
}

const rows = await response.json();
const row = Array.isArray(rows) ? rows[0] : rows;

console.log(
  [
    "Supabase heartbeat succeeded.",
    `table=${HEARTBEAT_SCHEMA}.${HEARTBEAT_TABLE}`,
    `id=${HEARTBEAT_ID}`,
    `last_ping=${row?.last_ping ?? payload[0].last_ping}`,
  ].join(" ")
);
