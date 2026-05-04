//
// This source file is part of the Stanford Biodesign Digital Health MyHeart Counts open-source project based on the Stanford Spezi Template Application project
//
// SPDX-FileCopyrightText: 2025-2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import bcrypt from "bcryptjs";
import type { SessionFlow } from "@/lib/constants";
import { getServiceClient } from "@/lib/db/server";
import type { EvaluatorRow } from "@/types/db";

const EDU_DOMAIN_SUFFIX = ".edu";

export interface VerifyCredentialsResult {
  evaluator: EvaluatorRow;
  flow: SessionFlow;
}

const normalizeWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const isEduAffiliateEmail = (email: string): boolean =>
  email.toLowerCase().trim().endsWith(EDU_DOMAIN_SUFFIX);

const getStudyAffiliatePassword = (): string | null => {
  return process.env.STANFORD_AFFILIATE_PASSWORD?.trim() ?? null;
};

const getDoctorAffiliatePassword = (): string | null => {
  return process.env.DOCTOR_AFFILIATE_PASSWORD?.trim() ?? null;
};

const upsertEduAffiliate = async (args: {
  email: string;
  firstName: string;
  lastName: string;
  initialHashPassword: string;
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

  // First time we have seen this affiliate. Store a hash of whichever shared
  // password they used to satisfy the NOT NULL evaluator_code_hash column.
  // Subsequent shared-password matches are validated against the env var, not
  // this hash, so it does not need to be updated when the affiliate later
  // logs in via the other shared password.
  const sharedPasswordHash = await bcrypt.hash(args.initialHashPassword, 10);
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
    // If two requests race to create the same .edu affiliate row, fall back
    // to reading the now-existing evaluator.
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
): Promise<VerifyCredentialsResult | null> => {
  const supabase = getServiceClient();
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedEvaluatorId = evaluatorId.trim();
  const eduEmail = isEduAffiliateEmail(normalizedEmail);

  const studyPassword = getStudyAffiliatePassword();
  const doctorPassword = getDoctorAffiliatePassword();

  if (eduEmail) {
    const normalizedFirstName = firstName ? normalizeWhitespace(firstName) : "";
    const normalizedLastName = lastName ? normalizeWhitespace(lastName) : "";
    if (!normalizedFirstName || !normalizedLastName) {
      return null;
    }

    if (doctorPassword && normalizedEvaluatorId === doctorPassword) {
      const evaluator = await upsertEduAffiliate({
        email: normalizedEmail,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        initialHashPassword: doctorPassword,
      });
      return evaluator ? { evaluator, flow: "doctor" } : null;
    }

    if (studyPassword && normalizedEvaluatorId === studyPassword) {
      const evaluator = await upsertEduAffiliate({
        email: normalizedEmail,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        initialHashPassword: studyPassword,
      });
      return evaluator ? { evaluator, flow: "standard" } : null;
    }

    return null;
  }

  // Non-.edu branch: refuse either shared password so a seeded evaluator code
  // that happens to equal a shared password cannot leak into either flow,
  // and so the doctor flow is unreachable without a .edu email.
  if (
    (studyPassword && normalizedEvaluatorId === studyPassword) ||
    (doctorPassword && normalizedEvaluatorId === doctorPassword)
  ) {
    return null;
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

  return { evaluator, flow: "standard" };
};
