//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import bcrypt from "bcryptjs";
import { getServiceClient } from "@/lib/db/server";
import type { EvaluatorRow } from "@/types/db";

const STANFORD_DOMAIN = "@stanford.edu";
const DEFAULT_STANFORD_SHARED_PASSWORD = "fearthetree";

const normalizeWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const isStanfordAffiliateEmail = (email: string): boolean =>
  email.toLowerCase().trim().endsWith(STANFORD_DOMAIN);

const getStanfordSharedPassword = (): string =>
  process.env.STANFORD_AFFILIATE_PASSWORD?.trim() ??
  DEFAULT_STANFORD_SHARED_PASSWORD;

const upsertStanfordAffiliate = async (args: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<EvaluatorRow | null> => {
  const supabase = getServiceClient();
  const normalizedEmail = args.email.toLowerCase().trim();
  const normalizedFirstName = normalizeWhitespace(args.firstName);
  const normalizedLastName = normalizeWhitespace(args.lastName);

  const { data: existing, error: lookupError } = await supabase
    .from("evaluators")
    .select("id, email, evaluator_code_hash, active, first_name, last_name")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (lookupError) {
    return null;
  }

  if (existing) {
    const evaluator = existing as EvaluatorRow;
    if (!evaluator.active) {
      return null;
    }

    if (
      evaluator.first_name !== normalizedFirstName ||
      evaluator.last_name !== normalizedLastName
    ) {
      await supabase
        .from("evaluators")
        .update({
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
        })
        .eq("id", evaluator.id);
    }

    return {
      ...evaluator,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
    };
  }

  const sharedPasswordHash = await bcrypt.hash(getStanfordSharedPassword(), 10);
  const { data: inserted, error: insertError } = await supabase
    .from("evaluators")
    .insert({
      email: normalizedEmail,
      evaluator_code_hash: sharedPasswordHash,
      active: true,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
    })
    .select("id, email, evaluator_code_hash, active, first_name, last_name")
    .single();

  if (insertError) {
    // If two requests race to create the same Stanford affiliate row,
    // fall back to reading the now-existing evaluator.
    const { data: racedExisting, error: racedLookupError } = await supabase
      .from("evaluators")
      .select("id, email, evaluator_code_hash, active, first_name, last_name")
      .eq("email", normalizedEmail)
      .eq("active", true)
      .maybeSingle();
    if (racedLookupError || !racedExisting) {
      return null;
    }
    return racedExisting as EvaluatorRow;
  }

  return inserted as EvaluatorRow;
};

export const verifyEvaluatorCredentials = async (
  email: string,
  evaluatorId: string,
  firstName?: string,
  lastName?: string,
): Promise<EvaluatorRow | null> => {
  const supabase = getServiceClient();
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedEvaluatorId = evaluatorId.trim();

  if (isStanfordAffiliateEmail(normalizedEmail)) {
    const normalizedFirstName = firstName ? normalizeWhitespace(firstName) : "";
    const normalizedLastName = lastName ? normalizeWhitespace(lastName) : "";
    if (!normalizedFirstName || !normalizedLastName) {
      return null;
    }
    if (normalizedEvaluatorId !== getStanfordSharedPassword()) {
      return null;
    }

    return upsertStanfordAffiliate({
      email: normalizedEmail,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
    });
  }

  const { data, error } = await supabase
    .from("evaluators")
    .select("id, email, evaluator_code_hash, active, first_name, last_name")
    .eq("email", normalizedEmail)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const evaluator = data as EvaluatorRow;
  const isMatch = await bcrypt.compare(
    normalizedEvaluatorId,
    evaluator.evaluator_code_hash,
  );
  if (!isMatch) {
    return null;
  }

  return evaluator;
};
